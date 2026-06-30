import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("warm dual mode shell separates customer ask surfaces from operations observation", () => {
  const source = readText("public/index.html");
  const customerBlock = extractBlock(source, '<section id="customer-home"', "</section>");
  const operationsBlock = extractBlock(source, '<section id="operations-observe"', "</section>");

  for (const token of [
    'data-app-mode="customer"',
    'data-app-mode="operations"',
    'id="customer-home"',
    'id="operations-observe"',
    'id="dashboard-refresh-button"',
    'id="knowledge-scope-card"',
    'id="ops-runtime-inspector"',
    'id="ops-log-list"',
    'id="ops-tool-call-list"'
  ]) {
    assert.match(source, new RegExp(escapeRegExp(token)));
  }

  assert.match(customerBlock, /id="ask-form"/);
  assert.match(customerBlock, /id="question"/);
  assert.match(customerBlock, /id="customer-prompt-list"/);
  assert.match(customerBlock, /id="customer-knowledge-list"/);
  assert.doesNotMatch(operationsBlock, /id="ask-form"|id="question"|id="ask-button"/);
});

test("warm dual mode keeps legacy runtime ids required by app bootstrap", () => {
  const source = readText("public/index.html");

  for (const id of [
    "runtime-status",
    "status-model",
    "model-name",
    "retrieval-mode",
    "tool-list",
    "version-select",
    "ask-form",
    "question",
    "ask-button"
  ]) {
    assert.match(source, new RegExp(`id="${id}"`), `${id} should be preserved`);
  }
});

test("warm dual mode frontend uses dashboard wrapper and responsive overflow guards", () => {
  const appSource = readText("public/app.js");
  const apiSource = readText("public/api.js");
  const styleSource = readText("public/styles.css");

  assert.match(appSource, /import\s*\{[^}]*fetchDashboard[^}]*\}\s*from\s*["']\.\/api\.js["']/s);
  assert.match(apiSource, /export async function fetchDashboard/);
  assert.match(apiSource, /fetchJson\(["']\/api\/dashboard["']\)/);
  assert.match(styleSource, /body\[data-mode="operations"\]/);
  assert.match(styleSource, /overflow-x:\s*hidden/);
  assert.match(styleSource, /minmax\(0,\s*1fr\)/);
  assert.match(styleSource, /@media\s*\(max-width:\s*900px\)/);
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
