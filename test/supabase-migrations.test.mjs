import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const MIGRATIONS_DIR = path.resolve("supabase", "migrations");
const CORE_TABLES = [
  "organizations",
  "profiles",
  "versions",
  "knowledge_sources",
  "ask_events",
  "run_steps",
  "questions",
  "question_clusters",
  "insight_reports",
  "improvement_suggestions",
  "faq_candidates",
  "skill_candidates",
  "insight_jobs",
  "insight_llm_runs",
  "knowledge_chunks"
];

test("supabase init migration defines the reserved assistant schema safely", async () => {
  const migration = await readInitMigration();
  const sql = migration.sql;

  assert.match(sql, /create\s+extension\s+if\s+not\s+exists\s+pgcrypto/i);

  for (const table of CORE_TABLES) {
    assert.match(sql, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\b`, "i"));
  }

  assert.match(sql, /\bjsonb\b/i);
  assert.match(sql, /\btimestamptz\b/i);

  for (const table of CORE_TABLES) {
    assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
  }

  assert.doesNotMatch(sql, /serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY|sk-[A-Za-z0-9_-]*|eyJ[A-Za-z0-9_-]*/);
  assert.doesNotMatch(sql, /\/Users\/|[A-Za-z]:\\|\/mnt\//);
  assert.doesNotMatch(sql, /assistant\.config\.json|data\/question-log\.jsonl/);

  for (const configPath of await readLocalConfigPaths()) {
    assert.equal(sql.includes(configPath), false, `migration must not contain local config path: ${configPath}`);
  }
});

async function readInitMigration() {
  const stats = await fs.stat(MIGRATIONS_DIR);
  assert.equal(stats.isDirectory(), true);

  const entries = await fs.readdir(MIGRATIONS_DIR);
  const fileName = entries.find((entry) => /init_modelmate_assistant_schema\.sql$/.test(entry));

  assert.ok(fileName, "expected an init_modelmate_assistant_schema.sql migration");

  const filePath = path.join(MIGRATIONS_DIR, fileName);
  return {
    filePath,
    sql: await fs.readFile(filePath, "utf8")
  };
}

async function readLocalConfigPaths() {
  try {
    const raw = await fs.readFile("assistant.config.json", "utf8");
    const values = collectStringValues(JSON.parse(raw));
    return values.filter((value) => path.isAbsolute(value) || /^[A-Za-z]:\\/.test(value));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function collectStringValues(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringValues(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectStringValues(item));
  }

  return [];
}
