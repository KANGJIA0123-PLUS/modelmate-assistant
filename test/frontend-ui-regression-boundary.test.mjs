import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("main frontend structure keeps the current app shell landmarks", () => {
  const source = readText("public/index.html");

  for (const token of ["app-shell", "side-panel", "workspace", "chat-view", "insights-view"]) {
    assert.match(source, new RegExp(`\\b${token}\\b`));
  }
});

test("stylesheet keeps motion, focus, and mobile responsive boundaries", () => {
  const source = readText("public/styles.css");

  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /focus-visible|:focus/);
  assert.match(source, /@media\s*\(max-width:/);
});

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
