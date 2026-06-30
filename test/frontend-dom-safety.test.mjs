import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const FRONTEND_FILES = [
  "public/app.js",
  "public/chat-stream.js",
  "public/insights-ui.js",
  "public/reports-ui.js"
];

test("app shell escapes dynamic HTML and keeps message updates on textContent", () => {
  const source = readText("public/app.js");
  const escapeHtml = extractFunction(source, "escapeHtml");
  const helpersBlock = extractConstObject(source, "helpers");
  const appendMessage = extractFunction(source, "appendMessage");
  const updateMessage = extractFunction(source, "updateMessage");
  const renderSessionList = extractFunction(source, "renderSessionList");
  const renderVersionSourceList = extractFunction(source, "renderVersionSourceList");
  const renderCapabilityStatus = extractFunction(source, "renderCapabilityStatus");

  assert.match(escapeHtml, /replaceAll\("&", "&amp;"\)/);
  assert.match(escapeHtml, /replaceAll\("<", "&lt;"\)/);
  assert.match(escapeHtml, /replaceAll\(">", "&gt;"\)/);
  assert.equal(escapeHtml.includes(".replaceAll('\"', \"&quot;\")"), true);
  assert.match(escapeHtml, /replaceAll\("'", "&#039;"\)/);

  assert.match(helpersBlock, /\bescapeHtml\b/);
  assert.match(source, /const reportsUi = createReportsUi\(\{ dom, state, helpers \}\)/);
  assert.match(source, /const insightsUi = createInsightsUi\(\{ dom, state, reportsUi, helpers \}\)/);

  assert.match(appendMessage, /escapeHtml\(sender\)/);
  assert.match(appendMessage, /escapeHtml\(meta\)/);
  assert.match(appendMessage, /escapeHtml\(body\)/);
  assert.match(updateMessage, /querySelector\("\.message-body"\)\.textContent = body/);
  assert.match(updateMessage, /querySelector\("\.message-meta"\)\.textContent = meta/);
  assert.match(renderSessionList, /escapeHtml\(session\.title \|\| "新会话"\)/);
  assert.match(renderVersionSourceList, /escapeHtml\(version\.name \|\| version\.id\)/);
  assert.match(renderVersionSourceList, /escapeHtml\(formatVersionMeta\(version\)\)/);
  assert.match(renderCapabilityStatus, /escapeHtml\(item\.summary\)/);
  assert.doesNotMatch(source, /innerHTML\s*\+=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*`[^`]*\$\{\s*error\.message/s);
});

test("chat stream keeps model output and process details on textContent paths", () => {
  const source = readText("public/chat-stream.js");
  const createProcessPanel = extractFunction(source, "createProcessPanel");
  const processPanelTemplate = extractAssignedTemplate(createProcessPanel, "details.innerHTML");
  const parseStreamEvent = extractFunction(source, "parseStreamEvent");
  const upsertProcessStep = extractFunction(source, "upsertProcessStep");
  const setProcessSummary = extractFunction(source, "setProcessSummary");

  assert.match(source, /import \{ openAskStream \} from "\.\/api\.js";/);
  assert.doesNotMatch(source, /\bfetchJson\b/);
  assert.match(source, /streamState\.answer \+= event\.text \|\| "";/);
  assert.match(source, /helpers\.updateMessage\(message, streamState\.answer, streamState\.meta\)/);
  assert.match(upsertProcessStep, /querySelector\("strong"\)\.textContent = title/);
  assert.match(upsertProcessStep, /querySelector\("p"\)\.textContent = detail \|\| ""/);
  assert.match(setProcessSummary, /\.textContent = text \|\| ""/);
  assert.match(parseStreamEvent, /try\s*\{[\s\S]*JSON\.parse\(line\)[\s\S]*\}\s*catch\s*\{[\s\S]*return null/);
  assert.doesNotMatch(source, /innerHTML\s*\+=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
  assert.doesNotMatch(processPanelTemplate, /\$\{\s*(question|operator|event|answer|payload)\b/);
});

test("insights UI escapes table, card, suggestion, and error dynamic text", () => {
  const source = readText("public/insights-ui.js");
  const renderDataTable = extractFunction(source, "renderDataTable");
  const renderSuggestionCards = extractFunction(source, "renderSuggestionCards");

  assert.match(source, /from "\.\/api\.js"/);
  assert.doesNotMatch(source, /\bfetchJson\b/);
  assert.match(renderDataTable, /headers\.map\(\(header\) => `<th>\$\{helpers\.escapeHtml\(header\)\}<\/th>`\)/);
  assert.match(renderDataTable, /helpers\.escapeHtml\(cell \?\? "-"\)/);
  assert.match(source, /helpers\.escapeHtml\(item\.title \|\| "未命名缺口"\)/);
  assert.match(source, /helpers\.escapeHtml\(`\$\{item\.reason/);
  assert.match(source, /helpers\.escapeHtml\(`\$\{item\.priorityHint/);
  assert.match(source, /helpers\.escapeHtml\(`\$\{item\.type/);
  assert.match(renderSuggestionCards, /helpers\.escapeHtml\(`\$\{item\.priority/);
  assert.match(renderSuggestionCards, /helpers\.escapeHtml\(`\$\{item\.type/);
  assert.match(renderSuggestionCards, /helpers\.escapeHtml\(item\.description \|\| ""\)/);
  assert.match(renderSuggestionCards, /helpers\.escapeHtml\(item\.id\)/);
  assert.match(source, /helpers\.escapeHtml\(error\.message \|\| String\(error\)\)/);
  assert.doesNotMatch(source, /innerHTML\s*\+=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
});

test("reports UI escapes report list, job list, and report markdown preview", () => {
  const source = readText("public/reports-ui.js");
  const renderReportList = extractFunction(source, "renderReportList");
  const renderReportJobItem = extractFunction(source, "renderReportJobItem");
  const openInsightReport = extractFunction(source, "openInsightReport");

  assert.match(source, /from "\.\/api\.js"/);
  assert.doesNotMatch(source, /\bfetchJson\b/);
  assert.match(renderReportList, /helpers\.escapeHtml\(item\.reportId\)/);
  assert.match(renderReportList, /helpers\.escapeHtml\(item\.title \|\| "数据洞察报告"\)/);
  assert.match(renderReportList, /helpers\.escapeHtml\(`\$\{item\.type\} · \$\{item\.versionId\} · \$\{helpers\.formatRelativeTime\(item\.generatedAt\)\}`\)/);
  assert.match(renderReportJobItem, /helpers\.escapeHtml\(job\.status \|\| "queued"\)/);
  assert.match(renderReportJobItem, /helpers\.escapeHtml\(title\)/);
  assert.match(renderReportJobItem, /helpers\.escapeHtml\(detail\)/);
  assert.match(renderReportJobItem, /helpers\.escapeHtml\(resultReportId\)/);
  assert.match(openInsightReport, /helpers\.escapeHtml\(report\.title \|\| "数据洞察报告"\)/);
  assert.match(openInsightReport, /helpers\.escapeHtml\(lastReportMarkdown \|\| "报告为空。"\)/);
  assert.doesNotMatch(source, /innerHTML\s*\+=/);
  assert.doesNotMatch(source, /insertAdjacentHTML/);
});

test("frontend modules avoid broad dangerous DOM sinks", () => {
  for (const file of FRONTEND_FILES) {
    const source = readText(file);

    assert.doesNotMatch(source, /innerHTML\s*\+=/, `${file} must not append raw HTML`);
    assert.doesNotMatch(source, /insertAdjacentHTML/, `${file} must not insert adjacent HTML`);
    assert.doesNotMatch(source, /document\.write\s*\(/, `${file} must not write documents`);
    assert.doesNotMatch(source, /eval\s*\(/, `${file} must not use eval`);
    assert.doesNotMatch(source, /new Function\s*\(/, `${file} must not build functions dynamically`);
  }
}
);

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} function is missing`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} function body is missing`);
  return extractBalancedBlock(source, signatureEnd + 2);
}

function extractConstObject(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `${name} object is missing`);
  return extractBalancedBlock(source, source.indexOf("{", start));
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

function extractAssignedTemplate(source, assignment) {
  const escapedAssignment = assignment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedAssignment}\\s*=\\s*\\x60([\\s\\S]*?)\\x60;`);
  const matched = source.match(pattern);
  assert.ok(matched, `${assignment} template is missing`);
  return matched[1];
}
