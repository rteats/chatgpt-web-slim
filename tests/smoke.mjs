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
