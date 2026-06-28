import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("insights UI uses typed API wrappers instead of raw fetchJson calls", () => {
  const source = readText("public/insights-ui.js");

  assert.doesNotMatch(source, /import\s*\{[^}]*\bfetchJson\b[^}]*\}\s*from\s*["']\.\/api\.js["']/s);
  assert.equal(source.includes("fetchJson("), false);
  assert.match(source, /\bfetchInsightOverview\b/);
  assert.match(source, /\bfetchInsightFrequentQuestions\b/);
  assert.match(source, /\bfetchInsightCategories\b/);
  assert.match(source, /\bfetchInsightVersions\b/);
  assert.match(source, /\bfetchKnowledgeGaps\b/);
  assert.match(source, /\bfetchImprovementSuggestions\b/);
  assert.match(source, /\bfetchEfficiencyOpportunities\b/);
  assert.match(source, /\bupdateImprovementSuggestion\b/);
  assert.equal(source.includes('"/api/insights/'), false);
  assert.equal(source.includes("'/api/insights/"), false);
});

test("reports UI uses typed API wrappers instead of raw fetchJson calls", () => {
  const source = readText("public/reports-ui.js");

  assert.doesNotMatch(source, /import\s*\{[^}]*\bfetchJson\b[^}]*\}\s*from\s*["']\.\/api\.js["']/s);
  assert.equal(source.includes("fetchJson("), false);
  assert.match(source, /\bfetchReports\b/);
  assert.match(source, /\bfetchReportJobs\b/);
  assert.match(source, /\bfetchReportJob\b/);
  assert.match(source, /\bfetchReport\b/);
  assert.match(source, /generateInsightReport\s+as\s+requestInsightReportGeneration/);
  assert.equal(source.includes('"/api/reports'), false);
  assert.equal(source.includes("'/api/reports"), false);
  assert.equal(source.includes('"/api/report-jobs'), false);
  assert.equal(source.includes("'/api/report-jobs"), false);
});

test("public api keeps fetchJson for modules that have not migrated yet", () => {
  const source = readText("public/api.js");

  assert.match(source, /export async function fetchJson/);
});

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
