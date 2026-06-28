import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initInsightStore, SupabaseInsightStore } from "../src/insights/insight-store.mjs";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_ORG_ID = "00000000-0000-0000-0000-000000000002";

test("initInsightStore keeps sqlite as the default provider", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "modelmate-insight-store-"));
  const store = await initInsightStore({
    enabled: true,
    dbPath: path.join(dir, "assistant.sqlite")
  });

  try {
    assert.notEqual(store.constructor.name, "SupabaseInsightStore");
  } finally {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("initInsightStore keeps sqlite when provider is sqlite", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "modelmate-insight-store-"));
  const fake = new FakeSupabaseClient();
  const store = await initInsightStore({
    enabled: true,
    dbPath: path.join(dir, "assistant.sqlite")
  }, {
    database: {
      provider: "sqlite"
    },
    supabaseClient: fake
  });

  try {
    assert.notEqual(store.constructor.name, "SupabaseInsightStore");
    assert.equal(fake.calls.length, 0);
  } finally {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("SupabaseInsightStore validates required supabase configuration", async () => {
  await assert.rejects(
    () => initInsightStore({ enabled: true }, {
      database: { provider: "supabase", supabase: { serviceRoleKey: "service-role-secret", orgId: ORG_ID } },
      supabaseClient: new FakeSupabaseClient()
    }),
    /database\.supabase\.url is required when database\.provider=supabase/
  );
  await assert.rejects(
    () => initInsightStore({ enabled: true }, {
      database: { provider: "supabase", supabase: { url: "https://modelmate.example.supabase.co", orgId: ORG_ID } },
      supabaseClient: new FakeSupabaseClient()
    }),
    (error) => {
      assert.match(error.message, /database\.supabase\.serviceRoleKey is required when database\.provider=supabase/);
      assert.equal(error.message.includes("service-role-secret"), false);
      return true;
    }
  );
  await assert.rejects(
    () => initInsightStore({ enabled: true }, {
      database: { provider: "supabase", supabase: { url: "https://modelmate.example.supabase.co", serviceRoleKey: "service-role-secret" } },
      supabaseClient: new FakeSupabaseClient()
    }),
    /database\.supabase\.orgId is required when database\.provider=supabase/
  );
});

test("SupabaseInsightStore.saveQuestion writes org, version, and questions once", async () => {
  const fake = new FakeSupabaseClient();
  const store = createStore(fake);

  const first = await store.saveQuestion(questionRecord());
  const duplicate = await store.saveQuestion(questionRecord());

  assert.equal(first.id, "q_1");
  assert.equal(duplicate, null);
  assert.equal(fake.tables.organizations.length, 1);
  assert.equal(fake.tables.versions.length, 1);
  assert.equal(fake.tables.questions.length, 1);
  assert.deepEqual(fake.tables.organizations[0], { id: ORG_ID, name: "Default organization" });
  assert.equal(fake.tables.versions[0].id, "v1");
  assert.equal(fake.tables.versions[0].org_id, ORG_ID);

  const row = fake.tables.questions[0];
  assert.equal(row.org_id, ORG_ID);
  assert.equal(row.version_id, "v1");
  assert.equal(row.question_hash, "hash_1");
  assert.equal(row.category_l1, "code_logic");
  assert.equal(row.category_l2, "api_debugging");
  assert.deepEqual(row.model_names_json, ["test-model"]);
  assert.deepEqual(row.raw_event_json, { safe: true });
  assert.equal(fake.calls.length > 0, true);
  assert.equal(fake.calls.every((call) => call.schema === "assistant"), true);
  assert.equal(JSON.stringify(fake.tables).includes("service-role-secret"), false);
});

test("SupabaseInsightStore.upsertCluster merges repeated clusters", async () => {
  const fake = new FakeSupabaseClient();
  const store = createStore(fake);

  const first = await store.upsertCluster(clusterRecord({
    questionCount: 2,
    firstSeenAt: "2026-06-03T00:00:00.000Z",
    lastSeenAt: "2026-06-04T00:00:00.000Z",
    versions: ["v1"],
    sampleQuestionIds: ["q_1", "q_2"]
  }));
  const merged = await store.upsertCluster(clusterRecord({
    title: "更新后的接口排查",
    representativeQuestion: "接口 500 怎么办？",
    questionCount: 3,
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastSeenAt: "2026-06-07T00:00:00.000Z",
    versions: ["v1", "v2"],
    sampleQuestionIds: ["q_2", "q_3", "q_4", "q_5", "q_6", "q_7", "q_8", "q_9", "q_10"]
  }));

  assert.equal(first.questionCount, 2);
  assert.equal(fake.tables.question_clusters.length, 1);
  assert.equal(merged.questionCount, 5);
  assert.equal(merged.firstSeenAt, "2026-06-01T00:00:00.000Z");
  assert.equal(merged.lastSeenAt, "2026-06-07T00:00:00.000Z");
  assert.deepEqual(merged.versions, ["v1", "v2"]);
  assert.deepEqual(merged.sampleQuestionIds, ["q_1", "q_2", "q_3", "q_4", "q_5", "q_6", "q_7", "q_8"]);
  assert.equal(merged.title, "更新后的接口排查");
  assert.equal(merged.representativeQuestion, "接口 500 怎么办？");
});

test("SupabaseInsightStore lists questions and clusters with filters and org isolation", async () => {
  const fake = new FakeSupabaseClient();
  const store = createStore(fake);

  await store.saveQuestion(questionRecord({ id: "q_1", createdAt: "2026-06-07T00:00:00.000Z", versionId: "v1" }));
  await store.saveQuestion(questionRecord({ id: "q_2", createdAt: "2026-06-06T00:00:00.000Z", versionId: "v1", categoryL1: "knowledge_gap" }));
  await store.saveQuestion(questionRecord({ id: "q_3", createdAt: "2026-06-05T00:00:00.000Z", versionId: "v2" }));
  fake.tables.questions.push({ ...fake.tables.questions[0], id: "q_other", org_id: OTHER_ORG_ID });

  await store.upsertCluster(clusterRecord({ clusterId: "cluster_1", versionId: "v1", questionCount: 4, lastSeenAt: "2026-06-07T00:00:00.000Z" }));
  await store.upsertCluster(clusterRecord({ clusterId: "cluster_2", versionId: "v1", questionCount: 2, lastSeenAt: "2026-06-06T00:00:00.000Z" }));
  fake.tables.question_clusters.push({ ...fake.tables.question_clusters[0], cluster_id: "cluster_other", org_id: OTHER_ORG_ID, question_count: 99 });

  const questions = await store.listQuestions({
    versionId: "v1",
    rangeStart: "2026-06-06T00:00:00.000Z",
    rangeEnd: "2026-06-08T00:00:00.000Z",
    limit: 1
  });
  assert.equal(questions.items.length, 1);
  assert.equal(questions.items[0].id, "q_1");
  assert.deepEqual(Object.keys(questions.items[0]).sort(), [
    "answerPreview",
    "answerStatus",
    "categoryL1",
    "categoryL2",
    "createdAt",
    "elapsedMs",
    "id",
    "intent",
    "isKnowledgeGap",
    "isPlatformImprovementSignal",
    "isVersionRelated",
    "knowledgeHitStatus",
    "modelNames",
    "normalizedQuestion",
    "numTurns",
    "operator",
    "question",
    "questionHash",
    "questionPreview",
    "queueWaitMs",
    "redactedQuestion",
    "scenario",
    "sourceCount",
    "totalCostUsd",
    "versionId",
    "versionName"
  ].sort());

  const clusters = await store.listClusters({ versionId: "v1", limit: 10 });
  assert.deepEqual(clusters.items.map((item) => item.clusterId), ["cluster_1", "cluster_2"]);

  const overview = await store.getOverview({ versionId: "v1" });
  assert.equal(overview.totalQuestions, 2);
  assert.equal(overview.highFrequencyClusterCount, 2);
});

test("SupabaseInsightStore supports reports, suggestions, candidates, llm runs, jobs, and org isolation", async () => {
  const fake = new FakeSupabaseClient();
  const store = createStore(fake);

  const report = await store.saveReport(reportRecord());
  fake.tables.insight_reports.push({ ...fake.tables.insight_reports[0], report_id: "report_other", org_id: OTHER_ORG_ID });
  assert.equal(report.reportId, "report_1");
  assert.equal((await store.listReports({ type: "weekly" })).items.length, 1);
  const loadedReport = await store.getReport("report_1");
  assert.deepEqual(loadedReport.reportJson, { sections: [] });
  assert.deepEqual(loadedReport.metrics, { totalQuestions: 1 });
  assert.equal(loadedReport.markdown, "# report");

  const suggestion = await store.saveSuggestion(suggestionRecord());
  const updatedSuggestion = await store.updateSuggestion(suggestion.id, { status: "done", statusNote: "closed" });
  fake.tables.improvement_suggestions.push({ ...fake.tables.improvement_suggestions[0], id: "sug_other", org_id: OTHER_ORG_ID, status: "open" });
  assert.equal(updatedSuggestion.status, "done");
  assert.equal(updatedSuggestion.statusNote, "closed");
  assert.equal((await store.updateSuggestion("missing", { status: "done" })), null);
  assert.deepEqual((await store.listSuggestions({ status: "done" })).items.map((item) => item.id), ["sug_1"]);

  const faq = await store.saveFaqCandidate(faqRecord());
  const skill = await store.saveSkillCandidate(skillRecord());
  assert.equal(faq.id, "faq_1");
  assert.equal(skill.id, "skill_1");
  assert.deepEqual((await store.listFaqCandidates()).items.map((item) => item.id), ["faq_1"]);
  assert.deepEqual((await store.listSkillCandidates()).items.map((item) => item.id), ["skill_1"]);

  const llmRun = await store.saveLlmRun(llmRunRecord());
  assert.equal(llmRun.id, "llm_1");
  assert.equal(fake.tables.insight_llm_runs[0].org_id, ORG_ID);
  assert.equal(JSON.stringify(fake.tables.insight_llm_runs).includes("service-role-secret"), false);

  const job = await store.saveJob(jobRecord({ id: "job_1", status: "queued" }));
  await store.saveJob(jobRecord({ id: "job_2", status: "failed", createdAt: "2026-06-08T00:00:00.000Z", updatedAt: "2026-06-08T00:00:00.000Z" }));
  fake.tables.insight_jobs.push({ ...fake.tables.insight_jobs[0], id: "job_other", org_id: OTHER_ORG_ID, status: "queued" });
  const updatedJob = await store.updateJob("job_1", { status: "succeeded", result: { reportId: "report_1" } });
  assert.equal(job.status, "queued");
  assert.equal(updatedJob.status, "succeeded");
  assert.deepEqual(updatedJob.result, { reportId: "report_1" });
  assert.equal(await store.updateJob("missing", { status: "failed" }), null);
  assert.equal((await store.getJob("job_1")).id, "job_1");
  assert.deepEqual((await store.listJobs({ status: "succeeded,failed" })).items.map((item) => item.id), ["job_2", "job_1"]);
});

function createStore(fake) {
  return new SupabaseInsightStore({}, {
    database: databaseConfig(),
    supabaseClient: fake
  });
}

function databaseConfig() {
  return {
    provider: "supabase",
    supabase: {
      url: "https://modelmate.example.supabase.co",
      serviceRoleKey: "service-role-secret",
      orgId: ORG_ID,
      schema: "assistant"
    }
  };
}

function questionRecord(overrides = {}) {
  return {
    id: "q_1",
    createdAt: "2026-06-07T00:00:00.000Z",
    versionId: "v1",
    versionName: "Version One",
    operator: "tester",
    operatorHash: "operator_hash",
    question: "接口 500 怎么排查？",
    questionPreview: "接口 500 怎么排查？",
    redactedQuestion: "接口 500 怎么排查？",
    normalizedQuestion: "接口 500 怎么排查",
    questionHash: "hash_1",
    answerPreview: "answer",
    answerStatus: "answered",
    knowledgeHitStatus: "full",
    isKnowledgeGap: false,
    categoryL1: "code_logic",
    categoryL2: "api_debugging",
    intent: "debug",
    scenario: "api",
    isVersionRelated: true,
    isPlatformImprovementSignal: false,
    elapsedMs: 120,
    queueWaitMs: 5,
    sourceCount: 2,
    modelNames: ["test-model"],
    numTurns: 1,
    totalCostUsd: 0.01,
    remoteAddressHash: "remote_hash",
    userAgentHash: "ua_hash",
    rawEvent: { safe: true },
    ...overrides
  };
}

function clusterRecord(overrides = {}) {
  return {
    clusterId: "cluster_1",
    versionId: "v1",
    title: "接口排查",
    representativeQuestion: "接口 500 怎么排查？",
    questionHash: "hash_1",
    categoryL1: "code_logic",
    categoryL2: "api_debugging",
    questionCount: 1,
    firstSeenAt: "2026-06-07T00:00:00.000Z",
    lastSeenAt: "2026-06-07T00:00:00.000Z",
    versions: ["v1"],
    sampleQuestionIds: ["q_1"],
    status: "open",
    updatedAt: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}

function reportRecord() {
  return {
    reportId: "report_1",
    type: "weekly",
    title: "周报",
    versionId: "all",
    rangeStart: "2026-06-01T00:00:00.000Z",
    rangeEnd: "2026-06-07T00:00:00.000Z",
    status: "ready",
    llmEnhanced: false,
    llmStatus: "disabled",
    generatedAt: "2026-06-07T00:00:00.000Z",
    reportJson: { sections: [] },
    markdown: "# report",
    metrics: { totalQuestions: 1 }
  };
}

function suggestionRecord() {
  return {
    id: "sug_1",
    reportId: "report_1",
    type: "platform",
    title: "补文档",
    description: "补齐接口排查文档",
    priority: "P2",
    priorityScore: 2.5,
    status: "open",
    relatedClusterIds: ["cluster_1"],
    evidence: { questionCount: 3 },
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z"
  };
}

function faqRecord() {
  return {
    id: "faq_1",
    reportId: "report_1",
    clusterId: "cluster_1",
    question: "接口 500 怎么排查？",
    answerSummary: "看日志和配置",
    evidence: { questionCount: 3 },
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z"
  };
}

function skillRecord() {
  return {
    id: "skill_1",
    reportId: "report_1",
    title: "接口排查 Skill",
    triggerScenario: "接口报错",
    inputSummary: "问题和版本",
    outputSummary: "排查步骤",
    evidence: { questionCount: 3 },
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z"
  };
}

function llmRunRecord() {
  return {
    id: "llm_1",
    purpose: "report",
    inputHash: "input_hash",
    status: "success",
    elapsedMs: 30,
    modelNames: ["test-model"],
    errorMessage: "",
    createdAt: "2026-06-07T00:00:00.000Z"
  };
}

function jobRecord(overrides = {}) {
  return {
    id: "job_1",
    type: "report_generation",
    status: "queued",
    payload: { type: "weekly" },
    result: {},
    errorMessage: "",
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}

class FakeSupabaseClient {
  constructor() {
    this.calls = [];
    this.tables = {
      organizations: [],
      versions: [],
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
        return new FakeQuery(this, table);
      }
    };
  }

  from(table) {
    this.calls.push({ schema: "public", table });
    return new FakeQuery(this, table);
  }
}

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.limitValue = null;
    this.operation = "select";
    this.row = null;
    this.options = {};
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ type: "gte", column, value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ type: "lte", column, value });
    return this;
  }

  in(column, values) {
    this.filters.push({ type: "in", column, values });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({ column, ascending: Boolean(options.ascending) });
    return this;
  }

  limit(value) {
    this.limitValue = Number(value);
    return this;
  }

  upsert(row, options = {}) {
    this.operation = "upsert";
    this.row = { ...row };
    this.options = options;
    return this;
  }

  update(row) {
    this.operation = "update";
    this.row = { ...row };
    return this;
  }

  then(resolve, reject) {
    Promise.resolve()
      .then(() => this.execute())
      .then(resolve, reject);
  }

  execute() {
    if (this.operation === "upsert") {
      return this.executeUpsert();
    }

    if (this.operation === "update") {
      return this.executeUpdate();
    }

    return this.executeSelect();
  }

  executeSelect() {
    let rows = this.filteredRows();

    for (const order of [...this.orders].reverse()) {
      const direction = order.ascending ? 1 : -1;
      rows = rows.sort((left, right) => compareValues(left[order.column], right[order.column]) * direction);
    }

    if (Number.isFinite(this.limitValue)) {
      rows = rows.slice(0, this.limitValue);
    }

    return { data: rows.map((row) => ({ ...row })), error: null };
  }

  executeUpsert() {
    const rows = this.client.tables[this.table] || [];
    const keys = String(this.options.onConflict || "id").split(",").map((key) => key.trim()).filter(Boolean);
    const existingIndex = rows.findIndex((row) => keys.every((key) => row[key] === this.row[key]));

    if (existingIndex === -1) {
      rows.push({ ...this.row });
    } else if (!this.options.ignoreDuplicates) {
      rows[existingIndex] = { ...rows[existingIndex], ...this.row };
    }

    this.client.tables[this.table] = rows;
    return { data: null, error: null };
  }

  executeUpdate() {
    const rows = this.client.tables[this.table] || [];

    for (let index = 0; index < rows.length; index += 1) {
      if (this.matches(rows[index])) {
        rows[index] = { ...rows[index], ...this.row };
      }
    }

    return { data: null, error: null };
  }

  filteredRows() {
    return (this.client.tables[this.table] || []).filter((row) => this.matches(row));
  }

  matches(row) {
    for (const filter of this.filters) {
      if (filter.type === "eq" && row[filter.column] !== filter.value) {
        return false;
      }
      if (filter.type === "gte" && String(row[filter.column] || "") < String(filter.value || "")) {
        return false;
      }
      if (filter.type === "lte" && String(row[filter.column] || "") > String(filter.value || "")) {
        return false;
      }
      if (filter.type === "in" && !filter.values.includes(row[filter.column])) {
        return false;
      }
    }

    return true;
  }
}

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left || "").localeCompare(String(right || ""));
}
