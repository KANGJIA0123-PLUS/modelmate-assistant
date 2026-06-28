import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const PUBLIC_FILES = [
  "public/app.js",
  "public/api.js",
  "public/chat-stream.js",
  "public/insights-ui.js",
  "public/reports-ui.js",
  "public/sessions.js"
];
const SERVER_ONLY_PATTERNS = [
  "serviceRoleKey",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MODEL_MATE_SUPABASE_ORG_ID",
  "orgId",
  /(?:^|[^a-zA-Z])sk-[A-Za-z0-9_-]+/,
  "eyJ"
];

test("frontend modules import only their intended API boundary functions", () => {
  assert.deepEqual(parseApiImports(readText("public/app.js")), ["fetchRuntimeConfig", "fetchVersions"]);
  assert.deepEqual(parseApiImports(readText("public/chat-stream.js")), ["openAskStream"]);
  assert.equal(parseApiImports(readText("public/sessions.js")).length, 0);

  const insightsImports = parseApiImports(readText("public/insights-ui.js"));
  const reportsImports = parseApiImports(readText("public/reports-ui.js"));

  assert.equal(insightsImports.includes("fetchJson"), false);
  assert.equal(reportsImports.includes("fetchJson"), false);
  assert.match(readText("public/api.js"), /export async function fetchJson/);
});

test("UI modules do not hard-code backend endpoint strings", () => {
  const appSource = readText("public/app.js");
  const chatSource = readText("public/chat-stream.js");
  const insightsSource = readText("public/insights-ui.js");
  const reportsSource = readText("public/reports-ui.js");

  assert.equal(insightsSource.includes('"/api/insights/'), false);
  assert.equal(insightsSource.includes("'/api/insights/"), false);
  assert.equal(reportsSource.includes('"/api/reports'), false);
  assert.equal(reportsSource.includes("'/api/reports"), false);
  assert.equal(reportsSource.includes('"/api/report-jobs'), false);
  assert.equal(reportsSource.includes("'/api/report-jobs"), false);
  assert.equal(chatSource.includes('"/api/ask'), false);
  assert.equal(chatSource.includes("'/api/ask"), false);
  assert.equal(appSource.includes('"/api/insights/'), false);
  assert.equal(appSource.includes("'/api/insights/"), false);
  assert.equal(appSource.includes('"/api/reports'), false);
  assert.equal(appSource.includes("'/api/reports"), false);
  assert.equal(appSource.includes('"/api/report-jobs'), false);
  assert.equal(appSource.includes("'/api/report-jobs"), false);
});

test("public frontend files do not contain server-only Supabase or key-like fields", () => {
  for (const file of PUBLIC_FILES) {
    const source = readText(file);

    for (const pattern of SERVER_ONLY_PATTERNS) {
      if (typeof pattern === "string") {
        assert.equal(source.includes(pattern), false, `${file} must not contain ${pattern}`);
      } else {
        assert.doesNotMatch(source, pattern, `${file} must not contain ${pattern}`);
      }
    }
  }
});

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function parseApiImports(source) {
  const matched = source.match(/import\s*\{([^}]+)\}\s*from\s*["']\.\/api\.js["']/);

  if (!matched) {
    return [];
  }

  return matched[1]
    .split(",")
    .map((item) => item.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean)
    .sort();
}
