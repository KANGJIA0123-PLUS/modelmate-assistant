import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const DOC_PATH = "docs/frontend-tooling-mcp.md";
const FORBIDDEN_DEPENDENCIES = [
  "shadcn",
  "@shadcn/ui",
  "react",
  "next",
  "vite"
];
const FORBIDDEN_PUBLIC_STRINGS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "serviceRoleKey",
  "FIGMA_TOKEN",
  "CONTEXT7_API_KEY",
  "MCP_TOKEN"
];
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\beyJ[A-Za-z0-9_-]{12,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/,
  /FIGMA_TOKEN\s*=\s*\S+/,
  /CONTEXT7_API_KEY\s*=\s*\S+/
];

test("frontend MCP tooling guide exists and documents the recommended stack", () => {
  const source = readText(DOC_PATH);

  for (const expected of [
    "Frontend MCP / Skill / Plugin Guide",
    "Context7",
    "Playwright MCP",
    "Chrome DevTools MCP",
    "Figma MCP",
    "shadcn MCP",
    "Phase 1",
    "Context7 + Playwright MCP",
    "Phase 2",
    "Phase 3",
    "Hold"
  ]) {
    assert.match(source, new RegExp(escapeRegExp(expected)));
  }

  assert.match(source, /shadcn MCP[\s\S]*暂不启用/);
  assert.match(source, /不要提交 token/);
  assert.match(source, /不要提交真实 MCP 配置/);
  assert.match(source, /不要使用生产后台数据/);
  assert.match(source, /Playwright\/Chrome DevTools MCP 只用于本地开发页面/);
});

test("frontend MCP tooling guide does not contain secret-shaped values", () => {
  const source = readText(DOC_PATH);

  for (const pattern of SECRET_PATTERNS) {
    assert.doesNotMatch(source, pattern);
  }
});

test("README and AGENTS expose frontend MCP tooling rules", () => {
  const readme = readText("README.md");
  const agents = readText("AGENTS.md");

  assert.match(readme, /## Frontend MCP \/ tooling/);
  assert.match(readme, /docs\/frontend-tooling-mcp\.md/);
  assert.match(readme, /shadcn MCP 暂不启用/);
  assert.match(readme, /不得提交真实 token|不要提交真实 token/);

  assert.match(agents, /Context7/);
  assert.match(agents, /Playwright\/Chrome DevTools MCP/);
  assert.match(agents, /不得提交真实 MCP 配置/);
  assert.match(agents, /不得把 ~\/\.codex\/config\.toml/);
  assert.match(agents, /MCP 只能用于本地开发和测试数据/);
});

test("repository does not contain real MCP config files in committed locations", () => {
  for (const relativePath of [
    ".mcp.json",
    ".cursor/mcp.json",
    ".vscode/mcp.json"
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), false, `${relativePath} must not exist in the repo`);
  }

  const repoCodexConfig = path.join(ROOT, ".codex/config.toml");
  if (fs.existsSync(repoCodexConfig)) {
    const source = fs.readFileSync(repoCodexConfig, "utf8");
    for (const pattern of SECRET_PATTERNS) {
      assert.doesNotMatch(source, pattern);
    }
  }
});

test("package dependencies do not introduce frontend framework or shadcn tooling", () => {
  const packageJson = readJson("package.json");
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.optionalDependencies || {})
  };

  for (const dependency of FORBIDDEN_DEPENDENCIES) {
    assert.equal(dependency in dependencies, false, `${dependency} must not be installed`);
  }
});

test("public frontend files do not contain MCP tokens or service role keys", () => {
  for (const file of listFiles(path.join(ROOT, "public"))) {
    if (!file.endsWith(".js") && !file.endsWith(".html") && !file.endsWith(".css")) {
      continue;
    }

    const source = fs.readFileSync(file, "utf8");
    const relativePath = path.relative(ROOT, file);
    for (const value of FORBIDDEN_PUBLIC_STRINGS) {
      assert.equal(source.includes(value), false, `${relativePath} must not contain ${value}`);
    }
    for (const pattern of SECRET_PATTERNS) {
      assert.doesNotMatch(source, pattern, `${relativePath} must not contain ${pattern}`);
    }
  }
});

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
