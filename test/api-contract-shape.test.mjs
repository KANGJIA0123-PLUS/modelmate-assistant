import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("report routes and public API types agree on report response shape", () => {
  const routeSource = readText("src/routes/insights-routes.mjs");
  const storeSource = readText("src/insights/insight-store.mjs");
  const apiSource = readText("src/types/api.ts");

  assert.match(routeSource, /jobId:\s*job\.id,\s*job/s);
  assert.match(routeSource, /return report \? sendJson\(response, report\)/);
  assert.doesNotMatch(routeSource, /sendJson\(response,\s*\{\s*report\s*\}/);

  const reportSummaryBlock = extractFunction(storeSource, "publicReportSummaryRow");
  const reportRowBlock = extractFunction(storeSource, "publicReportRow");
  assert.match(reportSummaryBlock, /reportId:\s*row\.report_id/);
  assert.match(reportSummaryBlock, /generatedAt:\s*row\.generated_at/);
  assert.match(reportSummaryBlock, /metrics:\s*parseJson\(row\.metrics_json/);
  assert.match(reportRowBlock, /markdown:\s*row\.markdown/);

  const reportDetailBlock = extractInterface(apiSource, "ReportDetailResponse");
  const reportGenerateBlock = extractInterface(apiSource, "ReportGenerateResponse");
  assert.match(reportDetailBlock, /reportId:/);
  assert.match(reportDetailBlock, /markdown:/);
  assert.equal(/\breport\s*:/.test(reportDetailBlock), false);
  assert.match(reportGenerateBlock, /jobId:/);
  assert.match(reportGenerateBlock, /job:/);
});

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractInterface(source, name) {
  const start = source.indexOf(`export interface ${name}`);
  assert.notEqual(start, -1, `${name} interface is missing`);
  return extractBalancedBlock(source, source.indexOf("{", start));
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} function is missing`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} function body is missing`);
  return extractBalancedBlock(source, signatureEnd + 2);
}

function extractBalancedBlock(source, openIndex) {
  assert.notEqual(openIndex, -1, "opening brace is missing");

  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, index + 1);
      }
    }
  }

  assert.fail("balanced block is missing");
}
