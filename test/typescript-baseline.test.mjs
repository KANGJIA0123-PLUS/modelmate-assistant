import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();

test("tsconfig only includes shared type contract files", () => {
  const tsconfig = readJson("tsconfig.json");

  assert.deepEqual(tsconfig.include, [
    "src/types/**/*.ts",
    "test/types/**/*.ts"
  ]);
  assert.deepEqual(tsconfig.exclude, [
    "node_modules",
    "public",
    "data",
    "artifacts",
    "supabase",
    "knowledge",
    "repos"
  ]);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.module, "NodeNext");
  assert.equal(tsconfig.compilerOptions.moduleResolution, "NodeNext");
});

test("package exposes typecheck without frontend or runtime TypeScript tooling", () => {
  const packageJson = readJson("package.json");
  const allDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };

  assert.equal(packageJson.scripts?.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts?.start, "node src/server.mjs");
  assert.deepEqual(Object.keys(packageJson.devDependencies || {}).sort(), ["typescript"]);

  for (const forbidden of ["react", "vue", "next", "vite", "ts-node", "tsx", "@babel/core", "@swc/core"]) {
    assert.equal(forbidden in allDependencies, false, `${forbidden} must not be installed`);
  }
});

test("shared type index uses NodeNext js-extension re-exports", () => {
  const indexSource = readText("src/types/index.ts");

  assert.match(indexSource, /export \* from "\.\/domain\.js";/);
  assert.match(indexSource, /export \* from "\.\/api\.js";/);
  assert.match(indexSource, /export \* from "\.\/database\.js";/);
});

test("public config response type does not expose supabase secrets or org id", () => {
  const apiSource = readText("src/types/api.ts");
  const block = extractInterface(apiSource, "PublicConfigResponse");

  assert.equal(block.includes("serviceRoleKey"), false);
  assert.equal(block.includes("orgId"), false);
  assert.match(block, /database:/);
  assert.match(block, /supabase:/);
  assert.match(block, /schema:/);
});

test("runtime and frontend files remain JavaScript modules", () => {
  const runtimeTsFiles = listFiles(path.join(ROOT, "src"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.relative(ROOT, file))
    .filter((file) => !file.startsWith("src/types/"));
  const publicTsFiles = listFiles(path.join(ROOT, "public"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.relative(ROOT, file));

  assert.deepEqual(runtimeTsFiles, []);
  assert.deepEqual(publicTsFiles, []);
  assert.equal(fs.existsSync(path.join(ROOT, "src/server.mjs")), true);
  assert.equal(fs.existsSync(path.join(ROOT, "public/app.js")), true);
});

test("sqlite to supabase question cluster mapper defines versions_json once", () => {
  const source = readText("src/migrations/sqlite-to-supabase.mjs");
  const functionBody = extractFunction(source, "mapQuestionClusterRow");

  assert.equal((functionBody.match(/\bversions_json\s*:/g) || []).length, 1);
});

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(filePath) : [filePath];
  });
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
