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

test("package exposes split typecheck scripts without frontend frameworks or runtime TypeScript tooling", () => {
  const packageJson = readJson("package.json");
  const allDependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };

  assert.equal(packageJson.scripts?.["typecheck:contracts"], "tsc --noEmit");
  assert.equal(packageJson.scripts?.["typecheck:frontend"], "tsc -p tsconfig.frontend.json --noEmit");
  assert.equal(packageJson.scripts?.typecheck, "npm run typecheck:contracts && npm run typecheck:frontend");
  assert.equal(packageJson.scripts?.start, "node src/server.mjs");
  assert.deepEqual(Object.keys(packageJson.devDependencies || {}).sort(), ["typescript"]);

  for (const forbidden of ["react", "vue", "next", "vite", "ts-node", "tsx", "@babel/core", "@swc/core"]) {
    assert.equal(forbidden in allDependencies, false, `${forbidden} must not be installed`);
  }
});

test("frontend tsconfig only checks the public api client with strict checkJs", () => {
  const tsconfig = readJson("tsconfig.frontend.json");

  assert.deepEqual(tsconfig.include, ["public/api.js"]);
  assert.deepEqual(tsconfig.exclude, [
    "node_modules",
    "data",
    "artifacts",
    "supabase",
    "knowledge",
    "repos"
  ]);
  assert.equal(tsconfig.compilerOptions.allowJs, true);
  assert.equal(tsconfig.compilerOptions.checkJs, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.module, "NodeNext");
  assert.equal(tsconfig.compilerOptions.moduleResolution, "NodeNext");
  assert.equal(tsconfig.compilerOptions.target, "ES2022");
  assert.deepEqual(tsconfig.compilerOptions.lib, ["ES2022", "DOM"]);
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

test("public api client opts into ts-check and avoids server-only fields", () => {
  const source = readText("public/api.js");
  const firstLine = source.split(/\r?\n/, 1)[0];

  assert.match(firstLine, /@ts-check/);
  assert.match(source, /@typedef\s+\{import\("\.\.\/src\/types\/index\.js"\)\.PublicConfigResponse\}/);
  assert.match(source, /@returns\s+\{Promise<PublicConfigResponse>\}/);
  assert.match(source, /@template T/);
  assert.equal(source.includes("serviceRoleKey"), false);
  assert.equal(source.includes("orgId"), false);
  assert.equal(source.includes("token"), false);
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
