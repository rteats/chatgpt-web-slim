"use strict";

const defaults = {
  offscreenRendering: true,
  shorterTransitions: false
};

const number = (value, suffix = "") =>
  typeof value === "number" && Number.isFinite(value)
    ? String(value) + suffix : "—";

async function currentTab() {
  const tabs = await chrome.tabs.query({
    active: true, currentWindow: true
  });
  return tabs[0];
}

async function refresh() {
  const status = document.getElementById("status");
  const stats = document.getElementById("stats");
  try {
    const tab = await currentTab();
    if (!tab || !tab.id) throw new Error("No active tab");
    const s = await chrome.tabs.sendMessage(tab.id, {
      type: "WEB_SLIM_STATS"
    });
    stats.hidden = false;
    status.textContent = s.selectorFound
      ? "Connected. Data is local to this tab."
      : "Connected. No conversation-turn elements detected on this page.";
    const fields = {
      turns: number(s.turns),
      contained: number(s.contained),
      longTasks: number(s.longTasks),
      blocking: number(s.totalBlockingMs, " ms"),
      resources: number(s.resources),
      cached: number(s.likelyCachedResources),
      dcl: number(s.domContentLoadedMs, " ms"),
      load: number(s.loadMs, " ms")
    };
    for (const [key, value] of Object.entries(fields)) {
      document.getElementById(key).textContent = value;
    }
  } catch {
    stats.hidden = true;
    status.textContent = "Open chatgpt.com and refresh the tab once after installing.";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const settings = await chrome.storage.local.get(defaults);
    for (const key of Object.keys(defaults)) {
      const input = document.getElementById(key);
      input.checked = Boolean(settings[key]);
      input.addEventListener("change", async () => {
        await chrome.storage.local.set({ [key]: input.checked });
        await refresh();
      });
    }
  } catch {
    document.getElementById("status").textContent =
      "Extension storage is unavailable.";
  }
  document.getElementById("refresh").addEventListener("click", refresh);
  await refresh();
});
