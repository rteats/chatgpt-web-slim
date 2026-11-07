(() => {
  "use strict";

  // Isolated-world content script. No backend calls and no conversation text access.
  const TURN_SELECTOR = 'article[data-testid^="conversation-turn-"]';
  const ATTR = "data-web-slim";
  const CSS_ID = "chatgpt-web-slim-style";
  const MIN_TURNS = 24;
  const defaults = {
    offscreenRendering: true,
    shorterTransitions: false
  };
  let settings = { ...defaults };
  let scanTimer = null;
  let longTasks = 0;
  let longTaskMs = 0;
  let maxLongTaskMs = 0;

  function installStyles() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent =
      '[' + ATTR + '="1"] {' +
      "content-visibility:auto !important;" +
      "contain-intrinsic-block-size:auto var(--web-slim-height, 480px) !important;" +
      "}" +
      'html[data-web-slim-motion] *, ' +
      'html[data-web-slim-motion] *::before, ' +
      'html[data-web-slim-motion] *::after {' +
      "transition-duration:1ms !important;" +
      "scroll-behavior:auto !important;" +
      "}";
    (document.head || document.documentElement).appendChild(style);
  }

  function unmark(turn) {
    turn.removeAttribute(ATTR);
    turn.style.removeProperty("--web-slim-height");
  }

  function optimizeVisibleDocument() {
    if (!document.documentElement) return;
    installStyles();
    document.documentElement.toggleAttribute(
      "data-web-slim-motion", settings.shorterTransitions
    );

    const supported = typeof CSS !== "undefined" &&
      CSS.supports("content-visibility", "auto");
    const turns = Array.from(document.querySelectorAll(TURN_SELECTOR));

    if (!settings.offscreenRendering || !supported || turns.length < MIN_TURNS) {
      document.querySelectorAll("[" + ATTR + "]").forEach(unmark);
      return;
    }

    // Use actual *pre-containment* heights, not arbitrary fixed placeholders.
    // Only distant blocks receive containment; never the active/final turns.
    const viewport = Math.max(window.innerHeight, 1);
    const active = document.activeElement;
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      if (i >= turns.length - 2 || (active && turn.contains(active))) {
        if (turn.hasAttribute(ATTR)) unmark(turn);
        continue;
      }
      if (turn.hasAttribute(ATTR)) continue;
      const rect = turn.getBoundingClientRect();
      if (!Number.isFinite(rect.height) || rect.height < 24) continue;
      const distant = rect.bottom < -viewport * 0.5 ||
        rect.top > viewport * 1.75;
      if (!distant) continue;

      turn.style.setProperty(
        "--web-slim-height", Math.ceil(rect.height) + "px"
      );
      turn.setAttribute(ATTR, "1");
    }
  }

  function scheduleScan(delay = 950) {
    if (scanTimer !== null) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      // Let the host finish its current render before measuring.
      if (document.visibilityState === "hidden") return;
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(optimizeVisibleDocument, { timeout: 1500 });
      } else {
        optimizeVisibleDocument();
      }
    }, delay);
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks++;
        longTaskMs += Math.max(0, entry.duration - 50);
        maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    // The Long Tasks API is optional. Rendering optimization still works.
  }

  function stats() {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const cached = resources.filter((r) =>
      r.transferSize === 0 && r.decodedBodySize > 0
    ).length;
    return {
      turns: document.querySelectorAll(TURN_SELECTOR).length,
      contained: document.querySelectorAll("[" + ATTR + "]").length,
      longTasks,
      totalBlockingMs: Math.round(longTaskMs),
      maxLongTaskMs: Math.round(maxLongTaskMs),
      resources: resources.length,
      likelyCachedResources: cached,
      domContentLoadedMs: navigation
        ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
      enabled: settings.offscreenRendering,
      selectorFound: document.querySelector(TURN_SELECTOR) !== null
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "WEB_SLIM_STATS") {
      sendResponse(stats());
    } else if (message && message.type === "WEB_SLIM_RESCAN") {
      scheduleScan(0);
      sendResponse({ ok: true });
    }
  });

  chrome.storage.local.get(defaults, (saved) => {
    if (chrome.runtime.lastError) return;
    settings = { ...defaults, ...saved };
    scheduleScan(1200);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let changed = false;
    for (const key of Object.keys(defaults)) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        settings[key] = Boolean(changes[key].newValue);
        changed = true;
      }
    }
    if (changed) scheduleScan(0);
  });

  // React/SPA navigation can insert new turn nodes without a page reload.
  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if ((node.matches && node.matches(TURN_SELECTOR)) ||
            (node.querySelector && node.querySelector(TURN_SELECTOR))) {
          scheduleScan(1200);
          return;
        }
      }
    }
  });
  mutationObserver.observe(document.documentElement, {
    subtree: true, childList: true
  });
  document.addEventListener("click", (event) => {
    const element = event.target;
    if (element instanceof Element &&
        element.closest('a[href*="/c/"]')) scheduleScan(1600);
  }, { capture: true, passive: true });
  window.addEventListener("popstate", () => scheduleScan(1100));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleScan(350);
  });
})();
