import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createSupabaseServiceClient } from "../supabase-client.mjs";

export const MIGRATION_TABLES = [
  "ask_events",
  "questions",
  "question_clusters",
  "insight_reports",
  "improvement_suggestions",
  "faq_candidates",
  "skill_candidates",
  "insight_llm_runs",
  "insight_jobs"
];

const WRITE_ORDER = [
  "organizations",
  "versions",
  ...MIGRATION_TABLES
];

const CONFLICT_TARGETS = {
  organizations: "id",
  versions: "id",
  ask_events: "org_id,event_key",
  questions: "id",
  question_clusters: "cluster_id",
  insight_reports: "report_id",
  improvement_suggestions: "id",
  faq_candidates: "id",
  skill_candidates: "id",
  insight_llm_runs: "id",
  insight_jobs: "id"
};

const MAPPERS = {
  ask_events: mapAskEventRow,
  questions: mapQuestionRow,
  question_clusters: mapQuestionClusterRow,
  insight_reports: mapReportRow,
  improvement_suggestions: mapSuggestionRow,
  faq_candidates: mapFaqCandidateRow,
  skill_candidates: mapSkillCandidateRow,
  insight_llm_runs: mapLlmRunRow,
  insight_jobs: mapJobRow
};

export function readSqliteMigrationSource(options = {}) {
  const dbPath = path.resolve(String(options.dbPath || ""));

  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error(`SQLite 数据库不存在：${dbPath || "(empty)"}`);
  }

  const selectedTables = normalizeTableSelection(options.tables);
  const db = new DatabaseSync(dbPath);
  const warnings = [];
  const tables = {};

  try {
    for (const table of MIGRATION_TABLES) {
      if (!selectedTables.has(table)) {
        tables[table] = [];
        continue;
      }

      if (!sqliteTableExists(db, table)) {
        tables[table] = [];
        warnings.push(`SQLite 表不存在，已跳过：${table}`);
        continue;
      }

      tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
    }
  } finally {
    db.close();
  }

  return { dbPath, tables, warnings };
}

export function buildSqliteToSupabasePlan(source, options = {}) {
  const selectedTables = normalizeTableSelection(options.tables);
  const database = options.database || {};
  const supabase = database.supabase || {};
  const orgId = String(options.orgId || supabase.orgId || "").trim();
  const schema = String(options.schema || supabase.schema || "public").trim() || "public";
  const context = { orgId };
  const rowsByTable = {};
  const summary = createSummary({
    dryRun: options.dryRun !== false,
    dbPath: source.dbPath,
    schema,
    orgIdPresent: Boolean(orgId),
    warnings: source.warnings || []
  });

  for (const table of MIGRATION_TABLES) {
    const rows = Array.isArray(source.tables?.[table]) ? source.tables[table] : [];
    const mapper = MAPPERS[table];
    rowsByTable[table] = selectedTables.has(table) ? rows.map((row) => mapper(row, context)) : [];
    summary.tables[table].read = rows.length;
    summary.tables[table].planned = rowsByTable[table].length;
  }

  const organizations = orgId ? [{ id: orgId, name: "Default organization" }] : [];
  const versions = collectVersions(source, selectedTables, orgId);
  summary.versions.planned = versions.length;

  return {
    dryRun: summary.dryRun,
    dbPath: source.dbPath,
    schema,
    orgId,
    organizations,
    versions,
    rowsByTable,
    summary
  };
}

export async function migrateSqliteToSupabase(options = {}) {
  const dryRun = options.dryRun !== false;
  const batchSize = normalizeBatchSize(options.batchSize);
  const source = options.source || readSqliteMigrationSource({
    dbPath: options.dbPath,
    tables: options.tables
  });
  const plan = buildSqliteToSupabasePlan(source, {
    ...options,
    dryRun
  });

  if (dryRun) {
    return cloneSummary(plan.summary);
  }

  const supabase = validateExecuteDatabase(options.database || {});
  const secrets = [supabase.serviceRoleKey].filter(Boolean);
  const client = options.supabaseClient || createSupabaseServiceClient(options.database);
  const summary = cloneSummary(plan.summary);
  summary.dryRun = false;

  for (const target of WRITE_ORDER) {
    const rows = rowsForTarget(plan, target);
    const written = await upsertBatches({
      client,
      schema: plan.schema,
      tableName: target,
      rows,
      batchSize,
      onConflict: CONFLICT_TARGETS[target],
      secrets
    });

    if (target === "versions") {
      summary.versions.written = written;
    } else if (summary.tables[target]) {
      summary.tables[target].written = written;
    }
  }

  return summary;
}

export function mapAskEventRow(row = {}, context = {}) {
  return {
    org_id: context.orgId || "",
    event_key: stringValue(row.event_key),
    created_at: stringValue(row.created_at),
    version_id: stringValue(row.version_id),
    version_name: stringValue(row.version_name),
    operator: stringValue(row.operator),
    operator_hash: stringValue(row.operator_hash),
    question: stringValue(row.question),
    normalized_question: stringValue(row.normalized_question),
    question_hash: stringValue(row.question_hash),
    answer_preview: stringValue(row.answer_preview),
    category: stringValue(row.category),
    elapsed_ms: integerValue(row.elapsed_ms),
    quick_reply: booleanValue(row.quick_reply),
    history_message_count: integerValue(row.history_message_count),
    source_count: integerValue(row.source_count),
    model_names_json: parseJsonValue(row.model_names_json, []),
    num_turns: nullableInteger(row.num_turns),
    total_cost_usd: nullableNumber(row.total_cost_usd)
  };
}

export function mapQuestionRow(row = {}, context = {}) {
  return {
    id: stringValue(row.id),
    org_id: context.orgId || "",
    created_at: stringValue(row.created_at),
    version_id: stringValue(row.version_id),
    version_name: stringValue(row.version_name),
    operator: stringValue(row.operator),
    operator_hash: stringValue(row.operator_hash),
    question: stringValue(row.question),
    question_preview: stringValue(row.question_preview),
    redacted_question: stringValue(row.redacted_question),
    normalized_question: stringValue(row.normalized_question),
    question_hash: stringValue(row.question_hash),
    answer_preview: stringValue(row.answer_preview),
    answer_status: stringValue(row.answer_status, "unknown"),
    knowledge_hit_status: stringValue(row.knowledge_hit_status, "unknown"),
    is_knowledge_gap: booleanValue(row.is_knowledge_gap),
    category_l1: stringValue(row.category_l1, "other"),
    category_l2: stringValue(row.category_l2, "unclear"),
    intent: stringValue(row.intent),
    scenario: stringValue(row.scenario),
    is_version_related: booleanValue(row.is_version_related),
    is_platform_improvement_signal: booleanValue(row.is_platform_improvement_signal),
    elapsed_ms: integerValue(row.elapsed_ms),
    queue_wait_ms: integerValue(row.queue_wait_ms),
    source_count: integerValue(row.source_count),
    model_names_json: parseJsonValue(row.model_names_json, []),
    num_turns: nullableInteger(row.num_turns),
    total_cost_usd: nullableNumber(row.total_cost_usd),
    remote_address_hash: stringValue(row.remote_address_hash),
    user_agent_hash: stringValue(row.user_agent_hash),
    raw_event_json: parseJsonValue(row.raw_event_json, {})
  };
}

export function mapQuestionClusterRow(row = {}, context = {}) {
  return {
    cluster_id: stringValue(row.cluster_id),
    org_id: context.orgId || "",
    version_id: stringValue(row.version_id),
    title: stringValue(row.title),
    representative_question: stringValue(row.representative_question),
    question_hash: stringValue(row.question_hash),
    category_l1: stringValue(row.category_l1, "other"),
    category_l2: stringValue(row.category_l2, "unclear"),
    question_count: integerValue(row.question_count),
    first_seen_at: stringValue(row.first_seen_at),
    last_seen_at: stringValue(row.last_seen_at),
    versions_json: parseJsonValue(row.versions_json, []),
    sample_question_ids_json: parseJsonValue(row.sample_question_ids_json, []),
    status: stringValue(row.status, "open"),
    updated_at: stringValue(row.updated_at)
  };
}

export function mapReportRow(row = {}, context = {}) {
  return {
    report_id: stringValue(row.report_id),
    org_id: context.orgId || "",
    type: stringValue(row.type, "weekly"),
    title: stringValue(row.title),
    version_id: stringValue(row.version_id, "all"),
    range_start: stringValue(row.range_start),
    range_end: stringValue(row.range_end),
    status: stringValue(row.status, "ready"),
    llm_enhanced: booleanValue(row.llm_enhanced),
    llm_status: stringValue(row.llm_status, "disabled"),
    generated_at: stringValue(row.generated_at),
    report_json: parseJsonValue(row.report_json, {}),
    markdown: stringValue(row.markdown),
    metrics_json: parseJsonValue(row.metrics_json, {})
  };
}

export function mapSuggestionRow(row = {}, context = {}) {
  return {
    id: stringValue(row.id),
    org_id: context.orgId || "",
    report_id: nullIfEmpty(row.report_id),
    type: stringValue(row.type, "platform"),
    title: stringValue(row.title),
    description: stringValue(row.description),
    priority: stringValue(row.priority, "P3"),
    priority_score: numberValue(row.priority_score),
    status: stringValue(row.status, "open"),
    status_note: stringValue(row.status_note),
    related_cluster_ids_json: parseJsonValue(row.related_cluster_ids_json, []),
    evidence_json: parseJsonValue(row.evidence_json, {}),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at)
  };
}

export function mapFaqCandidateRow(row = {}, context = {}) {
  return {
    id: stringValue(row.id),
    org_id: context.orgId || "",
    report_id: nullIfEmpty(row.report_id),
    cluster_id: nullIfEmpty(row.cluster_id),
    question: stringValue(row.question),
    answer_summary: stringValue(row.answer_summary),
    evidence_json: parseJsonValue(row.evidence_json, {}),
    status: stringValue(row.status, "open"),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at)
  };
}

export function mapSkillCandidateRow(row = {}, context = {}) {
  return {
    id: stringValue(row.id),
    org_id: context.orgId || "",
    report_id: nullIfEmpty(row.report_id),
    title: stringValue(row.title),
    trigger_scenario: stringValue(row.trigger_scenario),
    input_summary: stringValue(row.input_summary),
    output_summary: stringValue(row.output_summary),
    evidence_json: parseJsonValue(row.evidence_json, {}),
    status: stringValue(row.status, "open"),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at)
  };
}

export function mapLlmRunRow(row = {}, context = {}) {
  return {
    id: stringValue(row.id),
    org_id: context.orgId || "",
    purpose: stringValue(row.purpose),
    input_hash: stringValue(row.input_hash),
    status: stringValue(row.status, "unknown"),
    elapsed_ms: integerValue(row.elapsed_ms),
    model_names_json: parseJsonValue(row.model_names_json, []),
    error_message: stringValue(row.error_message),
    created_at: stringValue(row.created_at)
  };
}

export function mapJobRow(row = {}, context = {}) {
  return {
    id: stringValue(row.id),
    org_id: context.orgId || "",
    type: stringValue(row.type, "report_generation"),
    status: stringValue(row.status, "queued"),
    payload_json: parseJsonValue(row.payload_json, {}),
    result_json: parseJsonValue(row.result_json, {}),
    error_message: stringValue(row.error_message),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at)
  };
}

function createSummary({ dryRun, dbPath, schema, orgIdPresent, warnings }) {
  const tables = Object.fromEntries(MIGRATION_TABLES.map((table) => [table, {
    read: 0,
    planned: 0,
    written: 0,
    skipped: 0
  }]));

  return {
    dryRun: Boolean(dryRun),
    dbPath,
    schema,
    orgIdPresent,
    tables,
    versions: {
      planned: 0,
      written: 0
    },
    warnings: [...warnings]
  };
}

function cloneSummary(summary) {
  return JSON.parse(JSON.stringify(summary));
}

function collectVersions(source, selectedTables, orgId) {
  if (!orgId) {
    return [];
  }

  const versions = new Map();

  for (const row of selectedTables.has("ask_events") ? source.tables.ask_events || [] : []) {
    addVersion(versions, row.version_id, row.version_name);
  }

  for (const row of selectedTables.has("questions") ? source.tables.questions || [] : []) {
    addVersion(versions, row.version_id, row.version_name);
  }

  for (const row of selectedTables.has("question_clusters") ? source.tables.question_clusters || [] : []) {
    addVersion(versions, row.version_id, row.version_name);
  }

  return [...versions.values()].map((version) => ({
    id: version.id,
    org_id: orgId,
    name: version.name || version.id
  }));
}

function addVersion(versions, versionId, versionName) {
  const id = String(versionId || "").trim();

  if (!id || id === "all" || versions.has(id)) {
    return;
  }

  versions.set(id, {
    id,
    name: String(versionName || id).trim() || id
  });
}

function rowsForTarget(plan, target) {
  if (target === "organizations") {
    return plan.organizations;
  }

  if (target === "versions") {
    return plan.versions;
  }

  return plan.rowsByTable[target] || [];
}

async function upsertBatches({ client, schema, tableName, rows, batchSize, onConflict, secrets }) {
  let written = 0;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabaseTable(client, schema, tableName).upsert(batch, { onConflict });

    if (error) {
      throw sanitizeSupabaseError(`Supabase ${tableName} 迁移写入失败`, error, secrets);
    }

    written += batch.length;
  }

  return written;
}

function supabaseTable(client, schema, tableName) {
  if (schema && schema !== "public" && typeof client.schema === "function") {
    return client.schema(schema).from(tableName);
  }

  return client.from(tableName);
}

function validateExecuteDatabase(database) {
  const supabase = database?.supabase || {};
  const url = String(supabase.url || "").trim();
  const serviceRoleKey = String(supabase.serviceRoleKey || "").trim();
  const orgId = String(supabase.orgId || "").trim();
  const schema = String(supabase.schema || "public").trim() || "public";

  if (!url) {
    throw new Error("database.supabase.url is required for --execute.");
  }

  if (!serviceRoleKey) {
    throw new Error("database.supabase.serviceRoleKey is required for --execute.");
  }

  if (!orgId) {
    throw new Error("database.supabase.orgId is required for --execute.");
  }

  return { url, serviceRoleKey, orgId, schema };
}

function sanitizeSupabaseError(message, error, secrets = []) {
  const rawDetail = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .map(String)
    .join("；") || "unknown error";
  const detail = secrets.reduce((text, secret) => secret ? text.split(secret).join("[redacted]") : text, rawDetail);
  return new Error(`${message}：${detail}`);
}

function sqliteTableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function normalizeTableSelection(tables) {
  const selected = new Set(Array.isArray(tables)
    ? tables
    : String(tables || "").split(","));
  const normalized = new Set([...selected].map((table) => String(table || "").trim()).filter(Boolean));

  if (normalized.size === 0) {
    return new Set(MIGRATION_TABLES);
  }

  return new Set([...normalized].filter((table) => MIGRATION_TABLES.includes(table)));
}

function normalizeBatchSize(value) {
  const number = Number(value || 100);
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 100;
}

function parseJsonValue(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function stringValue(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function nullIfEmpty(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function booleanValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  return !["", "0", "false", "no", "off", "null"].includes(normalized);
}

function integerValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function nullableInteger(value) {
  if (value == null || value === "") {
    return null;
  }

  return integerValue(value);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
