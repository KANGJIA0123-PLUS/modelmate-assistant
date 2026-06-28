import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("stream delta text reaches the DOM only through the safe updateMessage path", () => {
  const chatSource = readText("public/chat-stream.js");
  const appSource = readText("public/app.js");
  const deltaBlock = extractIfBlock(chatSource, 'event.type === "delta"');
  const updateMessage = extractFunction(appSource, "updateMessage");

  assert.match(deltaBlock, /streamState\.answer \+= event\.text \|\| ""/);
  assert.match(deltaBlock, /helpers\.updateMessage\(message, streamState\.answer, streamState\.meta\)/);
  assert.doesNotMatch(deltaBlock, /innerHTML/);
  assert.match(updateMessage, /querySelector\("\.message-body"\)\.textContent = body/);
  assert.match(updateMessage, /querySelector\("\.message-meta"\)\.textContent = meta/);
});

test("stream parsing and errors fail safely without serializing full events", () => {
  const source = readText("public/chat-stream.js");
  const parseStreamEvent = extractFunction(source, "parseStreamEvent");
  const errorBlock = extractIfBlock(source, 'event.type === "error"');

  assert.match(parseStreamEvent, /try\s*\{[\s\S]*JSON\.parse\(line\)[\s\S]*\}\s*catch\s*\{[\s\S]*return null/);
  assert.match(errorBlock, /new Error\(event\.error \|\| "流式响应失败。"\)/);
  assert.doesNotMatch(errorBlock, /JSON\.stringify\(event\)/);
});

test("process panel step details are written with textContent", () => {
  const source = readText("public/chat-stream.js");
  const upsertProcessStep = extractFunction(source, "upsertProcessStep");
  const setProcessSummary = extractFunction(source, "setProcessSummary");

  assert.match(upsertProcessStep, /querySelector\("strong"\)\.textContent = title/);
  assert.match(upsertProcessStep, /querySelector\("p"\)\.textContent = detail \|\| ""/);
  assert.match(setProcessSummary, /\.textContent = text \|\| ""/);
});

test("chat stream avoids dangerous dynamic-code and raw-HTML sinks", () => {
  const source = readText("public/chat-stream.js");

  for (const pattern of [/eval\s*\(/, /new Function\s*\(/, /document\.write\s*\(/, /innerHTML\s*\+=/, /insertAdjacentHTML\s*\(/]) {
    assert.doesNotMatch(source, pattern);
  }
});

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

function extractIfBlock(source, condition) {
  const start = source.indexOf(`if (${condition})`);
  assert.notEqual(start, -1, `${condition} block is missing`);
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
