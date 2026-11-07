import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

test("manifest requests no interception or broad host permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage", "activeTab"]);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://chatgpt.com/*"]);
});

test("extension JavaScript parses", () => {
  for (const file of ["content.js", "popup.js"]) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }));
  }
});

test("no network interception or persistent chat storage", () => {
  const source = fs.readFileSync("content.js", "utf8");
  assert.doesNotMatch(source, /webRequest|declarativeNetRequest|fetch\s*\(|XMLHttpRequest|sendBeacon|\.innerText|\.textContent\s*;/);
  assert.match(source, /content-visibility/);
  assert.match(source, /getBoundingClientRect/);
});


test("offscreen containment batches geometry reads before any turn mutations", () => {
  const calls = [];
  const turns = Array.from({ length: 26 }, (_, index) => ({
    hasAttribute: () => false,
    contains: () => false,
    getBoundingClientRect() {
      calls.push(["read", index]);
      return { height: 120, top: 1300 + index * 150,
        bottom: 1420 + index * 150 };
    },
    style: {
      setProperty() { calls.push(["write", index]); },
      removeProperty() { calls.push(["write", index]); }
    },
    setAttribute() { calls.push(["write", index]); },
    removeAttribute() { calls.push(["write", index]); }
  }));
  const context = {
    console,
    CSS: { supports: () => true },
    window: { innerHeight: 900, addEventListener() {} },
    document: {
      documentElement: { toggleAttribute() {} },
      head: { appendChild() {} },
      getElementById: () => null,
      createElement: () => ({ id: "", textContent: "" }),
      querySelectorAll: (selector) =>
        selector.startsWith("article") ? turns : [],
      visibilityState: "visible",
      activeElement: null,
      addEventListener() {}
    },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: {
        local: { get(_defaults, callback) {
          callback({ offscreenRendering: true, shorterTransitions: false });
        } },
        onChanged: { addListener() {} }
      }
    },
    PerformanceObserver: class { observe() {} },
    MutationObserver: class { observe() {} },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    requestIdleCallback(callback) { callback(); }
  };

  vm.runInNewContext(fs.readFileSync("content.js", "utf8"), context);

  const readPositions = calls.flatMap((call, i) =>
    call[0] === "read" ? [i] : []);
  const writePositions = calls.flatMap((call, i) =>
    call[0] === "write" ? [i] : []);
  assert.ok(readPositions.length >= 20);
  assert.ok(writePositions.length >= 20);
  assert.ok(Math.max(...readPositions) < Math.min(...writePositions),
    "all geometry reads must finish before the first style mutation");
});
