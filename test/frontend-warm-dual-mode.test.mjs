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

test("warm dual mode exposes feedback and report entry controls", () => {
  const source = readText("public/index.html");

  for (const token of [
    'id="notification-button"',
    'id="notification-panel"',
    'id="refresh-status"',
    'data-open-insights="reports"',
    'id="ops-reports-button"',
    'id="ops-filter-row"',
    'id="ops-main-health-card"'
  ]) {
    assert.match(source, new RegExp(escapeRegExp(token)));
  }
});

test("customer empty conversation stays out of the way of search composer", () => {
  const source = readText("public/index.html");
  const appSource = readText("public/app.js");
  const styleSource = readText("public/styles.css");

  assert.match(source, /id="conversation"\s+class="conversation is-empty"/);
  assert.match(appSource, /conversation\.classList\.remove\("is-empty"\)/);
  assert.match(appSource, /conversation\.classList\.add\("is-empty"\)/);
  assert.match(styleSource, /\.conversation\.is-empty\s*{[^}]*display:\s*none/s);
});

test("warm dual mode wires notification, report center, and refresh feedback", () => {
  const appSource = readText("public/app.js");

  for (const token of [
    "notificationButton",
    "toggleNotificationPanel",
    "showInsightsView",
    "data-open-insights",
    "refreshStatus"
  ]) {
    assert.match(appSource, new RegExp(escapeRegExp(token)));
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
  assert.match(styleSource, /\.ops-metric-grid\s*{[^}]*repeat\(auto-fit,\s*minmax\(/s);
  assert.match(styleSource, /minmax\(0,\s*1fr\)/);
  assert.match(styleSource, /@media\s*\(max-width:\s*900px\)/);
});

test("chat messages wrap long Claude errors without breaking the layout", () => {
  const styleSource = readText("public/styles.css");
  const messageBlock = extractCssBlock(styleSource, ".message");
  const bodyBlock = extractCssBlock(styleSource, ".message-body");
  const processPanelBlock = extractCssBlock(styleSource, ".process-panel");
  const processStepDetailBlock = extractCssBlock(styleSource, ".process-steps li > div");

  assert.match(messageBlock, /min-width:\s*0/);
  assert.match(bodyBlock, /overflow-wrap:\s*anywhere/);
  assert.match(bodyBlock, /word-break:\s*break-word/);
  assert.match(processPanelBlock, /min-width:\s*0/);
  assert.match(processStepDetailBlock, /overflow-wrap:\s*anywhere/);
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

function extractCssBlock(source, selector) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} block should exist`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `${selector} block should close`);
  return source.slice(start, end + 1);
}
