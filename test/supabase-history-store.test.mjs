import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHistoryStore, SupabaseHistoryStore } from "../src/history-store.mjs";
import { buildPublicConfig } from "../src/public-config.mjs";

const ORG_ID = "00000000-0000-0000-0000-000000000001";

test("createHistoryStore keeps sqlite as the default provider", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "modelmate-sqlite-default-"));
  const store = await createHistoryStore({
    enabled: true,
    dbPath: path.join(dir, "assistant.sqlite"),
    jsonlPath: path.join(dir, "question-log.jsonl"),
    retentionDays: 180
  }, {
    backfill: false
  });

  try {
    assert.equal(store.constructor.name, "SqliteHistoryStore");
  } finally {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("createHistoryStore rejects incomplete supabase configuration clearly", async () => {
  await assert.rejects(
    () => createHistoryStore({ enabled: true }, {
      database: {
        provider: "supabase",
        supabase: {
          url: "",
          serviceRoleKey: "",
          orgId: ""
        }
      },
      supabaseClient: new FakeSupabaseClient()
    }),
    /database\.supabase\.url is required when database\.provider=supabase/
  );

  await assert.rejects(
    () => createHistoryStore({ enabled: true }, {
      database: {
        provider: "supabase",
        supabase: {
          url: "https://modelmate.example.supabase.co",
          serviceRoleKey: "",
          orgId: ORG_ID
        }
      },
      supabaseClient: new FakeSupabaseClient()
    }),
    /database\.supabase\.serviceRoleKey is required when database\.provider=supabase/
  );

  await assert.rejects(
    () => createHistoryStore({ enabled: true }, {
      database: {
        provider: "supabase",
        supabase: {
          url: "https://modelmate.example.supabase.co",
          serviceRoleKey: "service-role-secret",
          orgId: ""
        }
      },
      supabaseClient: new FakeSupabaseClient()
    }),
    /database\.supabase\.orgId is required when database\.provider=supabase/
  );
});

test("SupabaseHistoryStore records ask_events with normalized history fields", async () => {
  const client = new FakeSupabaseClient();
  const store = new SupabaseHistoryStore({}, {
    database: supabaseDatabaseConfig(),
    supabaseClient: client
  });

  const inserted = await store.record(questionEntry({
    versionId: "v1",
    versionName: "Version One",
    question: "订单接口 500 怎么排查？"
  }));

  assert.equal(inserted, true);
  assert.deepEqual(client.upserts.map((call) => call.table), ["organizations", "versions", "ask_events"]);
  assert.deepEqual(client.tables.organizations[0], {
    id: ORG_ID,
    name: "Default organization"
  });
  assert.equal(client.tables.versions[0].id, "v1");
  assert.equal(client.tables.versions[0].org_id, ORG_ID);
  assert.equal(client.tables.versions[0].name, "Version One");

  const event = client.tables.ask_events[0];
  assert.equal(event.org_id, ORG_ID);
  assert.equal(event.version_id, "v1");
  assert.equal(event.question, "订单接口 500 怎么排查？");
  assert.equal(event.category, "接口排障");
  assert.equal(event.quick_reply, false);
  assert.deepEqual(event.model_names_json, ["test-model"]);
  assert.equal(typeof event.event_key, "string");
  assert.equal(event.event_key.length, 64);
  assert.equal(typeof event.question_hash, "string");
  assert.equal(event.question_hash.length, 32);

  const serialized = JSON.stringify(client.tables);
  assert.equal(serialized.includes("serviceRoleKey"), false);
  assert.equal(serialized.includes("service-role-secret"), false);
});

test("SupabaseHistoryStore uses configured schema for writes and reads", async () => {
  const client = new FakeSupabaseClient();
  const store = new SupabaseHistoryStore({}, {
    database: supabaseDatabaseConfig({ schema: "assistant" }),
    supabaseClient: client
  });

  await store.record(questionEntry({ versionId: "v1", question: "订单接口 500 怎么排查？" }));
  await store.listHistory({ versionId: "v1", limit: 10 });
  await store.listFrequent({ versionId: "v1", limit: 10 });
  await store.listCategories({ versionId: "v1" });

  assert.equal(client.calls.length > 0, true);
  assert.equal(client.calls.every((call) => call.schema === "assistant"), true);
  assert.equal(client.calls.some((call) => call.table === "ask_events"), true);
});

test("SupabaseHistoryStore uses public schema when schema is omitted or public", async () => {
  const omittedSchemaClient = new FakeSupabaseClient();
  const omittedSchemaStore = new SupabaseHistoryStore({}, {
    database: supabaseDatabaseConfig({ schema: undefined }),
    supabaseClient: omittedSchemaClient
  });
  await omittedSchemaStore.record(questionEntry({ versionId: "v1", question: "订单接口 500 怎么排查？" }));

  const publicSchemaClient = new FakeSupabaseClient();
  const publicSchemaStore = new SupabaseHistoryStore({}, {
    database: supabaseDatabaseConfig({ schema: "public" }),
    supabaseClient: publicSchemaClient
  });
  await publicSchemaStore.record(questionEntry({ versionId: "v1", question: "订单接口 500 怎么排查？" }));

  assert.equal(omittedSchemaClient.calls.length > 0, true);
  assert.equal(omittedSchemaClient.calls.every((call) => call.schema === "public"), true);
  assert.equal(publicSchemaClient.calls.length > 0, true);
  assert.equal(publicSchemaClient.calls.every((call) => call.schema === "public"), true);
});

test("SupabaseHistoryStore redacts service role key from supabase errors", async () => {
  const client = new FakeSupabaseClient({
    errors: {
      ask_events: {
        message: "insert failed with service-role-secret"
      }
    }
  });
  const store = new SupabaseHistoryStore({}, {
    database: supabaseDatabaseConfig(),
    supabaseClient: client
  });

  await assert.rejects(
    () => store.record(questionEntry({ versionId: "v1", question: "订单接口 500 怎么排查？" })),
    (error) => {
      assert.match(error.message, /Supabase ask_events 写入失败/);
      assert.equal(error.message.includes("service-role-secret"), false);
      assert.equal(error.message.includes("[redacted]"), true);
      return true;
    }
  );
});

test("public config hides supabase service role key and org id", () => {
  const publicConfig = buildPublicConfig({
    config: {
      host: "127.0.0.1",
      port: 4878,
      model: "",
      claudeBare: false,
      maxTurns: 8,
      timeoutMs: 600000,
      retrievalMode: "claude-tools",
      contextMaxChars: 8000,
      historyMaxMessages: 8,
      historyMaxChars: 6000,
      queue: { implementationStatus: "implemented" },
      telemetry: {},
      skills: {},
      historyStore: { retentionDays: 180 },
      insights: {},
      warnings: [],
      allowedTools: ["Read", "Glob", "Grep", "LS"],
      disallowedTools: ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash", "WebFetch", "WebSearch"],
      database: supabaseDatabaseConfig({ schema: "assistant" })
    },
    versionRegistry: {
      getPublicDefaultVersionId: () => "default"
    },
    askQueue: {
      getStats: () => ({ activeCount: 0, queuedCount: 0 })
    },
    historyStore: {
      enabled: true
    }
  });
  const serialized = JSON.stringify(publicConfig);

  assert.equal(publicConfig.database.provider, "supabase");
  assert.equal(publicConfig.database.supabase.schema, "assistant");
  assert.equal("serviceRoleKey" in publicConfig.database.supabase, false);
  assert.equal("orgId" in publicConfig.database.supabase, false);
  assert.equal(serialized.includes("service-role-secret"), false);
  assert.equal(serialized.includes(ORG_ID), false);
});

test("SupabaseHistoryStore list methods return sqlite-compatible payloads", async () => {
  const client = new FakeSupabaseClient();
  const store = new SupabaseHistoryStore({}, {
    database: supabaseDatabaseConfig(),
    supabaseClient: client
  });

  await store.record(questionEntry({ versionId: "v1", question: "订单接口 500 怎么排查？", elapsedMs: 100, quickReply: true }));
  await store.record(questionEntry({ versionId: "v1", question: "订单接口 500 怎么排查", elapsedMs: 140, quickReply: false }));
  await store.record(questionEntry({ versionId: "v1", question: "README 用途是什么？", elapsedMs: 50, sourceCount: 2 }));
  await store.record(questionEntry({ versionId: "v2", question: "订单接口 500 怎么排查？", elapsedMs: 200 }));

  const history = await store.listHistory({ versionId: "v1", limit: 10, category: "接口排障" });
  assert.equal(history.enabled, true);
  assert.equal(history.items.length, 2);
  assert.ok(history.items.every((item) => item.versionId === "v1"));
  assert.deepEqual(Object.keys(history.items[0]).sort(), [
    "answerPreview",
    "category",
    "createdAt",
    "elapsedMs",
    "historyMessageCount",
    "id",
    "modelNames",
    "numTurns",
    "operator",
    "question",
    "quickReply",
    "sourceCount",
    "totalCostUsd",
    "versionId",
    "versionName"
  ].sort());

  const frequent = await store.listFrequent({ versionId: "v1", limit: 10 });
  assert.equal(frequent.items[0].hitCount, 2);
  assert.equal(frequent.items[0].category, "接口排障");
  assert.equal(frequent.items[0].avgElapsedMs, 120);
  assert.equal(frequent.items[0].quickReplyCount, 1);

  const categories = await store.listCategories({ versionId: "v1" });
  assert.ok(categories.items.some((item) => item.category === "接口排障" && item.questionCount === 2));
  assert.ok(categories.items.some((item) => item.category === "知识文档" && item.questionCount === 1 && item.sourceCount === 2));
});

function supabaseDatabaseConfig(overrides = {}) {
  const supabase = {
    url: "https://modelmate.example.supabase.co",
    serviceRoleKey: "service-role-secret",
    orgId: ORG_ID,
    schema: "public",
    ...overrides
  };

  for (const [key, value] of Object.entries(supabase)) {
    if (value === undefined) {
      delete supabase[key];
    }
  }

  return {
    provider: "supabase",
    supabase
  };
}

function questionEntry({ versionId, versionName = versionId, question, elapsedMs = 120, quickReply = false, sourceCount = 0 }) {
  return {
    timestamp: new Date().toISOString(),
    operator: "tester",
    versionId,
    versionName,
    question,
    answerPreview: "answer",
    elapsedMs,
    quickReply,
    historyMessageCount: 1,
    sourceCount,
    sources: Array.from({ length: sourceCount }, (_, index) => `source-${index}`),
    claude: {
      modelNames: ["test-model"],
      numTurns: 1,
      totalCostUsd: 0.01
    }
  };
}

class FakeSupabaseClient {
  constructor(options = {}) {
    this.tables = {
      organizations: [],
      versions: [],
      ask_events: []
    };
    this.upserts = [];
    this.calls = [];
    this.errors = options.errors || {};
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
    this.filters = [];
    this.orderBy = null;
    this.limitValue = null;
  }

  upsert(row, options = {}) {
    this.client.upserts.push({ table: this.table, row, options });
    const error = this.client.errors[this.table];

    if (error) {
      return { data: null, error };
    }

    const rows = this.client.tables[this.table] || [];
    const keys = String(options.onConflict || "id").split(",").map((key) => key.trim()).filter(Boolean);
    const existingIndex = rows.findIndex((candidate) => keys.every((key) => candidate[key] === row[key]));

    if (existingIndex === -1) {
      rows.push({ ...row });
    } else if (!options.ignoreDuplicates) {
      rows[existingIndex] = { ...rows[existingIndex], ...row };
    }

    this.client.tables[this.table] = rows;
    return { data: null, error: null };
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  order(column, options = {}) {
    this.orderBy = { column, ascending: Boolean(options.ascending) };
    return this;
  }

  limit(value) {
    this.limitValue = Number(value);
    return this;
  }

  then(resolve, reject) {
    try {
      resolve(this.execute());
    } catch (error) {
      reject(error);
    }
  }

  execute() {
    const error = this.client.errors[this.table];

    if (error) {
      return { data: null, error };
    }

    let rows = [...(this.client.tables[this.table] || [])];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    if (this.orderBy) {
      const direction = this.orderBy.ascending ? 1 : -1;
      rows.sort((left, right) => String(left[this.orderBy.column] || "").localeCompare(String(right[this.orderBy.column] || "")) * direction);
    }

    if (Number.isFinite(this.limitValue)) {
      rows = rows.slice(0, this.limitValue);
    }

    return { data: rows, error: null };
  }
}
