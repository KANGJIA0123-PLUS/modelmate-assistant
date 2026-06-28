import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = ["src", "scripts", "test"];
const EXTRA_TARGETS = ["public"];
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const files = [
  ...TARGETS.flatMap((target) => listMjsFiles(path.join(ROOT, target))),
  ...EXTRA_TARGETS.flatMap((target) => listJsFiles(path.join(ROOT, target)))
].sort();

let failed = false;

for (const file of files) {
  const relative = path.relative(ROOT, file);
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`Syntax check failed: ${relative}\n`);
    process.stderr.write(result.stderr || result.stdout || "");
  }
}

if (failed) {
  process.exit(1);
}

console.log(`Checked ${files.length} files.`);

if (packageJson.scripts?.typecheck) {
  const result = spawnSync("npm", ["run", "--silent", "typecheck"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    process.stderr.write("Typecheck failed.\n");
    process.stderr.write(result.stderr || result.stdout || "");
    process.exit(1);
  }

  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
  }
}

function listMjsFiles(dir) {
  return listFilesByExtension(dir, ".mjs");
}

function listJsFiles(dir) {
  return listFilesByExtension(dir, ".js");
}

function listFilesByExtension(dir, extension) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFilesByExtension(filePath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(filePath);
    }
  }

  return files;
}
