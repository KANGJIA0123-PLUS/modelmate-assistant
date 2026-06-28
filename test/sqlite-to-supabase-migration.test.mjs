import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildSqliteToSupabasePlan,
  mapAskEventRow,
  mapFaqCandidateRow,
  mapJobRow,
  mapQuestionRow,
  mapReportRow,
  mapSkillCandidateRow,
  mapSuggestionRow,
  migrateSqliteToSupabase,
  readSqliteMigrationSource
} from "../src/migrations/sqlite-to-supabase.mjs";

const ORG_ID = "00000000-0000-0000-0000-000000000001";

test("migration mappers convert sqlite rows to supabase-safe rows", () => {
  const context = { orgId: ORG_ID };

  const askEvent = mapAskEventRow({
    event_key: "event_1",
    created_at: "2026-06-07T00:00:00.000Z",
    version_id: "v1",
    version_name: "Version One",
    operator: "tester",
    question: "订单接口 500 怎么排查？",
    normalized_question: "订单接口 500 怎么排查",
    question_hash: "hash_1",
    answer_preview: "answer",
    category: "接口排障",
    elapsed_ms: 120,
    quick_reply: 1,
    history_message_count: 2,
    source_count: 3,
    model_names_json: "[\"claude-test\"]",
    num_turns: 1,
    total_cost_usd: 0.01
  }, context);
  assert.equal(askEvent.org_id, ORG_ID);
  assert.equal(askEvent.event_key, "event_1");
  assert.equal(askEvent.version_id, "v1");
  assert.equal(askEvent.quick_reply, true);
  assert.deepEqual(askEvent.model_names_json, ["claude-test"]);

  const question = mapQuestionRow({
    id: "q_1",
    created_at: "2026-06-07T00:00:00.000Z",
    version_id: "v1",
    version_name: "Version One",
    operator: "tester",
    operator_hash: "operator_hash",
    question: "订单接口 500 怎么排查？",
    question_preview: "订单接口 500 怎么排查？",
    redacted_question: "订单接口 500 怎么排查？",
    normalized_question: "订单接口 500 怎么排查",
    question_hash: "hash_1",
    answer_preview: "answer",
    answer_status: "answered",
    knowledge_hit_status: "full",
    is_knowledge_gap: 1,
    category_l1: "code_logic",
    category_l2: "api_debugging",
    intent: "debug",
    scenario: "api",
    is_version_related: 1,
    is_platform_improvement_signal: 0,
    elapsed_ms: 120,
    queue_wait_ms: 5,
    source_count: 2,
    model_names_json: "[\"claude-test\"]",
    num_turns: 1,
    total_cost_usd: 0.01,
    remote_address_hash: "remote_hash",
    user_agent_hash: "ua_hash",
    raw_event_json: "{\"safe\":true}"
  }, context);
  assert.equal(question.is_knowledge_gap, true);
  assert.equal(question.is_version_related, true);
  assert.equal(question.is_platform_improvement_signal, false);
  assert.deepEqual(question.model_names_json, ["claude-test"]);
  assert.deepEqual(question.raw_event_json, { safe: true });
  assert.equal(question.remote_address_hash, "remote_hash");
  assert.equal(question.user_agent_hash, "ua_hash");
  assert.equal("remote_address" in question, false);
  assert.equal("user_agent" in question, false);

  const report = mapReportRow({
    report_id: "report_1",
    type: "weekly",
    title: "周报",
    version_id: "all",
    range_start: "2026-06-01T00:00:00.000Z",
    range_end: "2026-06-07T00:00:00.000Z",
    status: "ready",
    llm_enhanced: 1,
    llm_status: "success",
    generated_at: "2026-06-07T00:00:00.000Z",
    report_json: "{\"sections\":[]}",
    markdown: "# report",
    metrics_json: "{\"totalQuestions\":1}"
  }, context);
  assert.equal(report.llm_enhanced, true);
  assert.deepEqual(report.report_json, { sections: [] });
  assert.deepEqual(report.metrics_json, { totalQuestions: 1 });

  const suggestion = mapSuggestionRow({
    id: "sug_1",
    report_id: "",
    type: "platform",
    title: "补文档",
    description: "补齐",
    priority: "P2",
    priority_score: 2.5,
    status: "open",
    status_note: "",
    related_cluster_ids_json: "[\"cluster_1\"]",
    evidence_json: "{\"questionCount\":3}",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z"
  }, context);
  assert.equal(suggestion.report_id, null);
  assert.deepEqual(suggestion.evidence_json, { questionCount: 3 });

  const faq = mapFaqCandidateRow({
    id: "faq_1",
    report_id: "",
    cluster_id: "",
    question: "订单接口 500 怎么排查？",
    answer_summary: "看日志",
    evidence_json: "{\"questionCount\":3}",
    status: "open",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z"
  }, context);
  assert.equal(faq.report_id, null);
  assert.equal(faq.cluster_id, null);
  assert.deepEqual(faq.evidence_json, { questionCount: 3 });

  const skill = mapSkillCandidateRow({
    id: "skill_1",
    report_id: "",
    title: "接口排查",
    trigger_scenario: "接口报错",
    input_summary: "问题",
    output_summary: "步骤",
    evidence_json: "{\"questionCount\":3}",
    status: "open",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z"
  }, context);
  assert.equal(skill.report_id, null);
  assert.deepEqual(skill.evidence_json, { questionCount: 3 });

  const job = mapJobRow({
    id: "job_1",
    type: "report_generation",
    status: "queued",
    payload_json: "{\"type\":\"weekly\"}",
    result_json: "{\"reportId\":\"report_1\"}",
    error_message: "",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z"
  }, context);
  assert.deepEqual(job.payload_json, { type: "weekly" });
  assert.deepEqual(job.result_json, { reportId: "report_1" });
});

test("dry-run reads sqlite and builds summary without writing supabase", async () => {
  const fixture = await createSqliteFixture();
  const client = new FakeSupabaseClient();

  try {
    const summary = await migrateSqliteToSupabase({
      dryRun: true,
      dbPath: fixture.dbPath,
      database: fakeDatabaseConfig(),
      supabaseClient: client
    });
    const serialized = JSON.stringify(summary);

    assert.equal(client.upserts.length, 0);
    assert.equal(summary.dryRun, true);
    assert.equal(summary.tables.ask_events.read, 2);
    assert.equal(summary.tables.questions.read, 1);
    assert.equal(summary.tables.insight_reports.read, 1);
    assert.equal(summary.tables.question_clusters.read, 0);
    assert.equal(summary.warnings.some((warning) => warning.includes("question_clusters")), true);
    assert.equal(summary.orgIdPresent, true);
    assert.equal(summary.versions.planned, 1);
    assert.equal(serialized.includes("订单接口 500"), false);
    assert.equal(serialized.includes("answer preview"), false);
    assert.equal(serialized.includes("service-role-secret"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("execute writes batches in order and stays idempotent for clusters", async () => {
  const fixture = await createSqliteFixture({ includeCluster: true });
  const client = new FakeSupabaseClient();

  try {
    const first = await migrateSqliteToSupabase({
      dryRun: false,
      dbPath: fixture.dbPath,
      database: fakeDatabaseConfig({ schema: "assistant" }),
      supabaseClient: client,
      batchSize: 1
    });
    const second = await migrateSqliteToSupabase({
      dryRun: false,
      dbPath: fixture.dbPath,
      database: fakeDatabaseConfig({ schema: "assistant" }),
      supabaseClient: client,
      batchSize: 1
    });

    assert.deepEqual(client.upserts.slice(0, 5).map((call) => call.table), [
      "organizations",
      "versions",
      "ask_events",
      "ask_events",
      "questions"
    ]);
    assert.equal(client.calls.length > 0, true);
    assert.equal(client.calls.every((call) => call.schema === "assistant"), true);
    assert.equal(client.upserts.some((call) => Array.isArray(call.rows) && call.rows.length === 1), true);
    assert.equal(client.tables.question_clusters[0].question_count, 7);
    assert.equal(first.tables.question_clusters.written, 1);
    assert.equal(second.tables.question_clusters.written, 1);
    assert.equal(first.tables.ask_events.written, 2);
    assert.equal(first.versions.written, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("migration validates execute config and supports table filtering", async () => {
  const fixture = await createSqliteFixture({ includeCluster: true });

  try {
    const dryRunWithoutSupabaseConfig = await migrateSqliteToSupabase({
      dryRun: true,
      dbPath: fixture.dbPath,
      database: { provider: "supabase", supabase: {} }
    });
    assert.equal(dryRunWithoutSupabaseConfig.orgIdPresent, false);

    await assert.rejects(
      () => migrateSqliteToSupabase({
        dryRun: false,
        dbPath: fixture.dbPath,
        database: {
          provider: "supabase",
          supabase: {
            serviceRoleKey: "service-role-secret",
            orgId: ORG_ID
          }
        },
        supabaseClient: new FakeSupabaseClient()
      }),
      (error) => {
        assert.match(error.message, /database\.supabase\.url is required/);
        assert.equal(error.message.includes("service-role-secret"), false);
        return true;
      }
    );

    await assert.rejects(
      () => migrateSqliteToSupabase({
        dryRun: false,
        dbPath: fixture.dbPath,
        database: {
          provider: "supabase",
          supabase: {
            url: "https://modelmate.example.supabase.co",
            orgId: ORG_ID
          }
        },
        supabaseClient: new FakeSupabaseClient()
      }),
      /database\.supabase\.serviceRoleKey is required/
    );

    await assert.rejects(
      () => migrateSqliteToSupabase({
        dryRun: false,
        dbPath: fixture.dbPath,
        database: {
          provider: "supabase",
          supabase: {
            url: "https://modelmate.example.supabase.co",
            serviceRoleKey: "service-role-secret"
          }
        },
        supabaseClient: new FakeSupabaseClient()
      }),
      (error) => {
        assert.match(error.message, /database\.supabase\.orgId is required/);
        assert.equal(error.message.includes("service-role-secret"), false);
        return true;
      }
    );

    const source = readSqliteMigrationSource({ dbPath: fixture.dbPath, tables: ["ask_events"] });
    const plan = buildSqliteToSupabasePlan(source, {
      database: fakeDatabaseConfig(),
      tables: ["ask_events"]
    });
    assert.equal(plan.summary.tables.ask_events.planned, 2);
    assert.equal(plan.summary.tables.questions.planned, 0);
    assert.equal(plan.summary.tables.question_clusters.planned, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("migration script and summary do not contain secret-like values", async () => {
  const script = await fs.readFile(path.resolve("scripts/migrate-sqlite-to-supabase.mjs"), "utf8");
  assert.doesNotMatch(script, /service-role-secret|sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+/);

  const fixture = await createSqliteFixture();

  try {
    const summary = await migrateSqliteToSupabase({
      dryRun: true,
      dbPath: fixture.dbPath,
      database: fakeDatabaseConfig()
    });
    assert.doesNotMatch(JSON.stringify(summary), /service-role-secret|sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+/);
  } finally {
    await fixture.cleanup();
  }
});

async function createSqliteFixture(options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "modelmate-sqlite-migration-"));
  const dbPath = path.join(dir, "assistant.sqlite");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE ask_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      version_id TEXT NOT NULL,
      version_name TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL DEFAULT '',
      normalized_question TEXT NOT NULL DEFAULT '',
      question_hash TEXT NOT NULL DEFAULT '',
      answer_preview TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      quick_reply INTEGER NOT NULL DEFAULT 0,
      history_message_count INTEGER NOT NULL DEFAULT 0,
      source_count INTEGER NOT NULL DEFAULT 0,
      model_names_json TEXT NOT NULL DEFAULT '[]',
      num_turns INTEGER,
      total_cost_usd REAL
    );
    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      version_id TEXT NOT NULL,
      version_name TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '',
      operator_hash TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL DEFAULT '',
      question_preview TEXT NOT NULL DEFAULT '',
      redacted_question TEXT NOT NULL DEFAULT '',
      normalized_question TEXT NOT NULL DEFAULT '',
      question_hash TEXT NOT NULL DEFAULT '',
      answer_preview TEXT NOT NULL DEFAULT '',
      answer_status TEXT NOT NULL DEFAULT 'unknown',
      knowledge_hit_status TEXT NOT NULL DEFAULT 'unknown',
      is_knowledge_gap INTEGER NOT NULL DEFAULT 0,
      category_l1 TEXT NOT NULL DEFAULT 'other',
      category_l2 TEXT NOT NULL DEFAULT 'unclear',
      intent TEXT NOT NULL DEFAULT '',
      scenario TEXT NOT NULL DEFAULT '',
      is_version_related INTEGER NOT NULL DEFAULT 0,
      is_platform_improvement_signal INTEGER NOT NULL DEFAULT 0,
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      queue_wait_ms INTEGER NOT NULL DEFAULT 0,
      source_count INTEGER NOT NULL DEFAULT 0,
      model_names_json TEXT NOT NULL DEFAULT '[]',
      num_turns INTEGER,
      total_cost_usd REAL,
      remote_address_hash TEXT NOT NULL DEFAULT '',
      user_agent_hash TEXT NOT NULL DEFAULT '',
      raw_event_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE insight_reports (
      report_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      version_id TEXT NOT NULL DEFAULT 'all',
      range_start TEXT NOT NULL,
      range_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      llm_enhanced INTEGER NOT NULL DEFAULT 0,
      llm_status TEXT NOT NULL DEFAULT 'disabled',
      generated_at TEXT NOT NULL,
      report_json TEXT NOT NULL DEFAULT '{}',
      markdown TEXT NOT NULL DEFAULT '',
      metrics_json TEXT NOT NULL DEFAULT '{}'
    );
  `);

  if (options.includeCluster) {
    db.exec(`
      CREATE TABLE question_clusters (
        cluster_id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        title TEXT NOT NULL,
        representative_question TEXT NOT NULL DEFAULT '',
        question_hash TEXT NOT NULL DEFAULT '',
        category_l1 TEXT NOT NULL DEFAULT 'other',
        category_l2 TEXT NOT NULL DEFAULT 'unclear',
        question_count INTEGER NOT NULL DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        versions_json TEXT NOT NULL DEFAULT '[]',
        sample_question_ids_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open',
        updated_at TEXT NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO question_clusters (
        cluster_id, version_id, title, representative_question, question_hash,
        category_l1, category_l2, question_count, first_seen_at, last_seen_at,
        versions_json, sample_question_ids_json, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "cluster_1",
      "v1",
      "接口排查",
      "订单接口 500 怎么排查？",
      "hash_1",
      "code_logic",
      "api_debugging",
      7,
      "2026-06-01T00:00:00.000Z",
      "2026-06-07T00:00:00.000Z",
      "[\"v1\"]",
      "[\"q_1\"]",
      "open",
      "2026-06-07T00:00:00.000Z"
    );
  }

  db.prepare(`
    INSERT INTO ask_events (
      event_key, created_at, version_id, version_name, operator, question,
      normalized_question, question_hash, answer_preview, category, elapsed_ms,
      quick_reply, history_message_count, source_count, model_names_json, num_turns,
      total_cost_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "event_1",
    "2026-06-07T00:00:00.000Z",
    "v1",
    "Version One",
    "tester",
    "订单接口 500 怎么排查？",
    "订单接口 500 怎么排查",
    "hash_1",
    "answer preview",
    "接口排障",
    120,
    1,
    1,
    2,
    "[\"claude-test\"]",
    1,
    0.01
  );
  db.prepare(`
    INSERT INTO ask_events (
      event_key, created_at, version_id, version_name, operator, question,
      normalized_question, question_hash, answer_preview, category, elapsed_ms,
      quick_reply, history_message_count, source_count, model_names_json, num_turns,
      total_cost_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "event_2",
    "2026-06-08T00:00:00.000Z",
    "v1",
    "Version One",
    "tester",
    "README 用途是什么？",
    "readme 用途是什么",
    "hash_2",
    "answer preview",
    "知识文档",
    80,
    0,
    1,
    0,
    "[]",
    1,
    0.01
  );
  db.prepare(`
    INSERT INTO questions (
      id, created_at, version_id, version_name, operator, operator_hash,
      question, question_preview, redacted_question, normalized_question,
      question_hash, answer_preview, answer_status, knowledge_hit_status,
      is_knowledge_gap, category_l1, category_l2, intent, scenario,
      is_version_related, is_platform_improvement_signal, elapsed_ms,
      queue_wait_ms, source_count, model_names_json, num_turns, total_cost_usd,
      remote_address_hash, user_agent_hash, raw_event_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "q_1",
    "2026-06-07T00:00:00.000Z",
    "v1",
    "Version One",
    "tester",
    "operator_hash",
    "订单接口 500 怎么排查？",
    "订单接口 500 怎么排查？",
    "订单接口 500 怎么排查？",
    "订单接口 500 怎么排查",
    "hash_1",
    "answer preview",
    "answered",
    "full",
    0,
    "code_logic",
    "api_debugging",
    "debug",
    "api",
    1,
    0,
    120,
    5,
    2,
    "[\"claude-test\"]",
    1,
    0.01,
    "remote_hash",
    "ua_hash",
    "{\"safe\":true}"
  );
  db.prepare(`
    INSERT INTO insight_reports (
      report_id, type, title, version_id, range_start, range_end, status,
      llm_enhanced, llm_status, generated_at, report_json, markdown, metrics_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "report_1",
    "weekly",
    "周报",
    "all",
    "2026-06-01T00:00:00.000Z",
    "2026-06-07T00:00:00.000Z",
    "ready",
    0,
    "disabled",
    "2026-06-07T00:00:00.000Z",
    "{\"sections\":[]}",
    "# report",
    "{\"totalQuestions\":1}"
  );
  db.close();

  return {
    dbPath,
    cleanup: () => fs.rm(dir, { recursive: true, force: true })
  };
}

function fakeDatabaseConfig(overrides = {}) {
  return {
    provider: "supabase",
    supabase: {
      url: "https://modelmate.example.supabase.co",
      serviceRoleKey: "service-role-secret",
      orgId: ORG_ID,
      schema: "public",
      ...overrides
    }
  };
}

class FakeSupabaseClient {
  constructor() {
    this.calls = [];
    this.upserts = [];
    this.tables = {
      organizations: [],
      versions: [],
      ask_events: [],
      questions: [],
      question_clusters: [],
      insight_reports: [],
      improvement_suggestions: [],
      faq_candidates: [],
      skill_candidates: [],
      insight_llm_runs: [],
      insight_jobs: []
    };
  }

  schema(schemaName) {
    return {
      from: (table) => {
        this.calls.push({ schema: schemaName, table });
        return new FakeSupabaseQuery(this, table);
      }
    };
  }

  from(table) {
    this.calls.push({ schema: "public", table });
    return new FakeSupabaseQuery(this, table);
  }
}

class FakeSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
  }

  upsert(rows, options = {}) {
    const batch = Array.isArray(rows) ? rows : [rows];
    this.client.upserts.push({ table: this.table, rows: batch.map((row) => ({ ...row })), options });
    const keys = String(options.onConflict || "id").split(",").map((key) => key.trim()).filter(Boolean);
    const target = this.client.tables[this.table] || [];

    for (const row of batch) {
      const existingIndex = target.findIndex((candidate) => keys.every((key) => candidate[key] === row[key]));

      if (existingIndex === -1) {
        target.push({ ...row });
      } else {
        target[existingIndex] = { ...target[existingIndex], ...row };
      }
    }

    this.client.tables[this.table] = target;
    return { data: null, error: null };
  }
}
