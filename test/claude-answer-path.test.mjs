import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("customer questions stay on the Claude Code streaming answer path", () => {
  const appSource = readText("public/app.js");
  const chatStreamSource = readText("public/chat-stream.js");
  const apiSource = readText("public/api.js");
  const askRoutesSource = readText("src/routes/ask-routes.mjs");

  assert.match(appSource, /createChatStream/);
  assert.match(appSource, /chatStream\.askStreaming\(\{/);
  assert.match(chatStreamSource, /import\s*\{\s*openAskStream\s*\}\s*from\s*["']\.\/api\.js["']/);
  assert.match(chatStreamSource, /openAskStream\(\{/);
  assert.match(apiSource, /fetch\(["']\/api\/ask-stream["']/);
  assert.match(askRoutesSource, /import\s*\{\s*askClaude\s*,\s*askClaudeStream\s*\}/);
  assert.match(askRoutesSource, /askClaudeStream\(/);
  assert.doesNotMatch(appSource, /fetch\(["']\/api\/ask/);
  assert.doesNotMatch(chatStreamSource, /fetch\(["']\/api\/ask/);
});

test("Claude Code stream errors keep the structured result message", () => {
  const runnerSource = readText("src/claude-runner.mjs");

  assert.match(runnerSource, /raw\?\.result \|\| answer/);
  assert.match(runnerSource, /formatClaudeError\(stderr \|\| raw\?\.result \|\| answer \|\| `Claude Code exited with code \$\{exitCode\}`\)/);
});

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
