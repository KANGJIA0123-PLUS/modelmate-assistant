import assert from "node:assert/strict";
import test from "node:test";
import { buildInsightSnapshot } from "../src/insights/insight-aggregator.mjs";
import { createReportJobRunner } from "../src/insights/report-job-runner.mjs";
import { generateInsightReport } from "../src/insights/report-generator.mjs";
import { recordInsightEntry } from "../src/insights/question-record.mjs";

test("recordInsightEntry awaits async store methods", async () => {
  const store = new AsyncInsightStore();
  const record = await recordInsightEntry(store, questionEntry());

  assert.equal(record?.versionId, "v1");
  assert.deepEqual(store.calls.slice(0, 3), ["saveQuestion", "listClusters", "upsertCluster"]);
  assert.equal(store.questions.length, 1);
  assert.equal(store.clusters.length, 1);
});

test("buildInsightSnapshot awaits async store reads", async () => {
  const store = new AsyncInsightStore();
  await store.saveQuestion(questionRecord());
  await store.upsertCluster(clusterRecord());

  const snapshot = await buildInsightSnapshot({
    store,
    config: configFixture(),
    versionRegistry: versionRegistryFixture(),
    query: { versionId: "v1", range: "7d" }
  });

  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.overview.metrics.totalQuestions, 1);
  assert.equal(snapshot.categories[0].categoryL1, "code_logic");
  assert.equal(snapshot.frequentQuestions[0].clusterId, "cluster_api_timeout");
  assert.equal(snapshot.versions[0].versionId, "v1");
  assert.ok(Array.isArray(snapshot.knowledgeGaps));
  assert.ok(Array.isArray(snapshot.efficiencyOpportunities));
});

test("generateInsightReport awaits async persistence methods", async () => {
  const store = new AsyncInsightStore();
  await store.saveQuestion(questionRecord());
  await store.upsertCluster(clusterRecord({ questionCount: 4 }));
  store.suggestions.push({
    id: "suggestion_existing",
    type: "platform",
    title: "补齐接口超时排查标准流程",
    description: "该问题重复出现，建议沉淀标准排查流程。",
    priority: "P2",
    priorityScore: 2.5,
    status: "open",
    relatedClusterIds: ["cluster_api_timeout"],
    evidence: { questionCount: 4 }
  });

  const result = await generateInsightReport({
    store,
    config: configFixture(),
    versionRegistry: versionRegistryFixture(),
    request: {
      type: "weekly",
      versionId: "v1",
      range: "7d",
      llmEnhanced: false
    }
  });

  assert.match(result.reportId, /^report_/);
  assert.equal(result.report?.reportId, result.reportId);
  assert.equal(store.calls.includes("saveReport"), true);
  assert.equal(store.calls.includes("getReport"), true);
  assert.equal(store.calls.includes("saveSuggestion"), true);
  assert.ok(store.suggestions.length > 1);
  assert.ok(store.faqCandidates.length > 0);
  assert.ok(store.skillCandidates.length > 0);
});

test("reportJobRunner awaits async store operations without unhandled rejections", async () => {
  const store = new AsyncInsightStore();
  const runner = createReportJobRunner({
    store,
    config: configFixture(),
    versionRegistry: versionRegistryFixture(),
    reportGenerator: async () => {
      await delay(5);
      return { reportId: "report_async_1" };
    }
  });

  const job = await runner.createReportJob({
    type: "weekly",
    versionId: "all",
    range: "7d",
    llmEnhanced: false
  });

  assert.equal(job.status, "queued");
  assert.equal((await runner.listJobs({ status: "queued,running,succeeded" })).items.length, 1);

  const done = await waitForJob(runner, job.id, "succeeded");
  assert.equal(done.result.reportId, "report_async_1");
  assert.equal(done.errorMessage, "");
});

function questionEntry() {
  return {
    timestamp: "2026-06-07T00:00:00.000Z",
    versionId: "v1",
    versionName: "Version One",
    operator: "tester",
    question: "接口超时怎么排查？",
    answerPreview: "answer",
    elapsedMs: 100,
    queueWaitMs: 5,
    sources: ["doc.md"],
    claude: {
      modelNames: ["test-model"],
      numTurns: 1,
      totalCostUsd: 0.01
    }
  };
}

function questionRecord() {
  return {
    id: "q_api_timeout",
    createdAt: "2026-06-07T00:00:00.000Z",
    versionId: "v1",
    versionName: "Version One",
    operator: "tester",
    operatorHash: "operator_hash",
    question: "接口超时怎么排查？",
    questionPreview: "接口超时怎么排查？",
    redactedQuestion: "接口超时怎么排查？",
    normalizedQuestion: "接口超时怎么排查",
    questionHash: "hash_api_timeout",
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
    elapsedMs: 100,
    queueWaitMs: 5,
    sourceCount: 1,
    modelNames: ["test-model"],
    numTurns: 1,
    totalCostUsd: 0.01,
    remoteAddressHash: "",
    userAgentHash: "",
    rawEvent: {}
  };
}

function clusterRecord(overrides = {}) {
  return {
    clusterId: "cluster_api_timeout",
    versionId: "v1",
    title: "接口超时排查",
    representativeQuestion: "接口超时怎么排查？",
    questionHash: "hash_api_timeout",
    categoryL1: "code_logic",
    categoryL2: "api_debugging",
    questionCount: 3,
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastSeenAt: "2026-06-07T00:00:00.000Z",
    versions: ["v1"],
    sampleQuestionIds: ["q_api_timeout"],
    status: "open",
    updatedAt: "2026-06-07T00:00:00.000Z",
    ...overrides
  };
}

function configFixture() {
  return {
    insights: {
      defaultRangeDays: 7,
      topClusterLimit: 10,
      maxPromptChars: 24000,
      llmEnhanced: false
    },
    skills: {
      enabled: true,
      candidateGenerationEnabled: true,
      minFaqHitCount: 3
    }
  };
}

function versionRegistryFixture() {
  return {
    listPublicVersions: () => [
      {
        id: "v1",
        name: "Version One"
      }
    ]
  };
}

class AsyncInsightStore {
  constructor() {
    this.enabled = true;
    this.calls = [];
    this.questions = [];
    this.clusters = [];
    this.reports = new Map();
    this.suggestions = [];
    this.faqCandidates = [];
    this.skillCandidates = [];
    this.jobs = new Map();
  }

  async saveQuestion(record) {
    await delay(1);
    this.calls.push("saveQuestion");
    this.questions.push(record);
    return record;
  }

  async listQuestions() {
    await delay(1);
    this.calls.push("listQuestions");
    return { enabled: true, items: [...this.questions] };
  }

  async upsertCluster(cluster) {
    await delay(1);
    this.calls.push("upsertCluster");
    this.clusters.push(cluster);
    return cluster;
  }

  async listClusters() {
    await delay(1);
    this.calls.push("listClusters");
    return { enabled: true, items: [...this.clusters] };
  }

  async listSuggestions() {
    await delay(1);
    this.calls.push("listSuggestions");
    return { enabled: true, items: [...this.suggestions] };
  }

  async saveReport(report) {
    await delay(1);
    this.calls.push("saveReport");
    this.reports.set(report.reportId, report);
    return report;
  }

  async getReport(reportId) {
    await delay(1);
    this.calls.push("getReport");
    return this.reports.get(String(reportId || "")) || null;
  }

  async saveSuggestion(suggestion) {
    await delay(1);
    this.calls.push("saveSuggestion");
    this.suggestions.push(suggestion);
    return suggestion;
  }

  async saveFaqCandidate(candidate) {
    await delay(1);
    this.calls.push("saveFaqCandidate");
    this.faqCandidates.push(candidate);
    return candidate;
  }

  async saveSkillCandidate(candidate) {
    await delay(1);
    this.calls.push("saveSkillCandidate");
    this.skillCandidates.push(candidate);
    return candidate;
  }

  async saveJob(job) {
    await delay(1);
    this.calls.push("saveJob");
    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(id) {
    await delay(1);
    this.calls.push("getJob");
    return this.jobs.get(String(id || "")) || null;
  }

  async listJobs(filter = {}) {
    await delay(1);
    this.calls.push("listJobs");
    const statuses = String(filter.status || "").split(",").map((status) => status.trim()).filter(Boolean);
    let items = [...this.jobs.values()];

    if (filter.type) {
      items = items.filter((job) => job.type === filter.type);
    }

    if (statuses.length > 0) {
      items = items.filter((job) => statuses.includes(job.status));
    }

    return { enabled: true, items };
  }

  async updateJob(id, patch) {
    await delay(1);
    this.calls.push("updateJob");
    const existing = this.jobs.get(String(id || ""));
    const updated = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(updated.id, updated);
    return updated;
  }
}

async function waitForJob(runner, jobId, status) {
  const deadline = Date.now() + 1000;

  while (Date.now() < deadline) {
    const job = await runner.getJob(jobId);

    if (job?.status === status) {
      return job;
    }

    await delay(10);
  }

  throw new Error(`job ${jobId} did not reach ${status}`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
