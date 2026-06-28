#!/usr/bin/env node
import { loadConfig } from "../src/config.mjs";
import { migrateSqliteToSupabase } from "../src/migrations/sqlite-to-supabase.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  const previousConfigPath = process.env.MODEL_MATE_CONFIG;

  if (args.config) {
    process.env.MODEL_MATE_CONFIG = args.config;
  }

  const config = loadConfig();

  if (previousConfigPath === undefined && args.config) {
    delete process.env.MODEL_MATE_CONFIG;
  } else if (args.config) {
    process.env.MODEL_MATE_CONFIG = previousConfigPath;
  }

  const summary = await migrateSqliteToSupabase({
    dryRun: args.dryRun,
    dbPath: args.db || config.historyStore?.dbPath,
    database: config.database,
    batchSize: args.batchSize,
    tables: args.tables
  });

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatSummary(summary));
  }
} catch (error) {
  console.error(sanitizeCliError(error));
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    json: false,
    config: "",
    db: "",
    batchSize: 100,
    tables: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--execute") {
      args.dryRun = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--config") {
      args.config = argv[++index] || "";
    } else if (arg === "--db") {
      args.db = argv[++index] || "";
    } else if (arg === "--batch-size") {
      args.batchSize = Number(argv[++index] || 100);
    } else if (arg === "--tables") {
      args.tables = String(argv[++index] || "").split(",").map((table) => table.trim()).filter(Boolean);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }

  return args;
}

function formatSummary(summary) {
  const lines = [
    `SQLite to Supabase migration ${summary.dryRun ? "dry-run" : "execute"}`,
    `Database: ${summary.dbPath}`,
    `Schema: ${summary.schema}`,
    `Org ID configured: ${summary.orgIdPresent ? "yes" : "no"}`,
    `Versions: planned ${summary.versions.planned}, written ${summary.versions.written}`,
    "Tables:"
  ];

  for (const [table, stats] of Object.entries(summary.tables)) {
    lines.push(`- ${table}: read ${stats.read}, planned ${stats.planned}, written ${stats.written}, skipped ${stats.skipped}`);
  }

  if (summary.warnings.length) {
    lines.push("Warnings:");
    for (const warning of summary.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

function sanitizeCliError(error) {
  const secrets = [
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ].filter(Boolean);
  const raw = String(error?.message || error || "unknown error");
  return secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), raw);
}
