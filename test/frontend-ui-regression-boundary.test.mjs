import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("main frontend structure keeps the current app shell landmarks", () => {
  const source = readText("public/index.html");

  for (const token of ["app-shell", "side-panel", "context-panel", "workspace", "chat-view", "insights-view"]) {
    assert.match(source, new RegExp(`\\b${token}\\b`));
  }

  assert.match(source, /<aside\s+class="side-panel"\s+aria-label="会话导航">/);
  assert.match(source, /<aside\s+class="context-panel"\s+aria-label="上下文与运行边界">/);
});

test("main frontend exposes warm dual mode, inspector, and composer surfaces", () => {
  const source = readText("public/index.html");

  for (const token of [
    "CUSTOMER KNOWLEDGE DESK",
    "OPERATIONS OBSERVATORY",
    "mode-switcher",
    "dashboard-refresh-button",
    "knowledge-scope-card",
    "ops-runtime-inspector",
    "AI OPS COPILOT",
    "bento-prompts",
    "command-composer",
    "stat-strip",
    "ai-status-card",
    "global-topbar"
  ]) {
    assert.match(source, new RegExp(escapeRegExp(token)));
  }
});

test("three-column shell keeps navigation, workspace, and context ownership", () => {
  const source = readText("public/index.html");
  const sidePanel = extractBlock(source, '<aside class="side-panel"', "</aside>");
  const workspace = extractBlock(source, '<section class="workspace"', "</section>");
  const contextPanel = extractBlock(source, '<aside class="context-panel"', "</aside>");

  for (const token of ["session-list", "new-session-button"]) {
    assert.match(sidePanel, new RegExp(`id="${token}"`));
  }

  for (const token of ["ask-form", "conversation"]) {
    assert.match(workspace, new RegExp(`id="${token}"`));
  }

  for (const token of ["operator-input", "version-select", "source-list", "boundary-summary"]) {
    assert.match(contextPanel, new RegExp(`id="${token}"`));
  }
});

test("stylesheet keeps three-column layout, scrolling panels, motion, focus, and mobile boundaries", () => {
  const source = readText("public/styles.css");

  assert.match(source, /\.context-panel\b/);
  assert.match(source, /\.app-shell\s*{[^}]*grid-template-columns:\s*minmax\([^)]*220px[^)]*280px[^)]*\)\s+minmax\(0,\s*1fr\)\s+minmax\([^)]*280px[^)]*340px[^)]*\)/s);
  assert.match(source, /\.side-panel\s*{[^}]*overflow(?:-y)?:\s*auto/s);
  assert.match(source, /\.context-panel\s*{[^}]*overflow(?:-y)?:\s*auto/s);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /focus-visible|:focus/);
  assert.match(source, /@media\s*\(max-width:/);
});

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractBlock(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${startNeedle} should exist`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `${endNeedle} should close ${startNeedle}`);
  return source.slice(start, end + endNeedle.length);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
