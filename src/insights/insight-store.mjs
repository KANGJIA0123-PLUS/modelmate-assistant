import fs from "node:fs";
import path from "node:path";
import { createSupabaseServiceClient } from "../supabase-client.mjs";
import { makeId, normalizeIsoDate, parseJson, safeJsonStringify } from "./ids.mjs";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 20000;
const OPEN_STATUSES = new Set(["open", "accepted", "in_progress", "done", "rejected"]);
const JOB_STATUSES = new Set(["queued", "running", "succeeded", "failed"]);

export function createDisabledInsightStore(reason = "") {
  return new MemoryInsightStore({ enabled: false, reason });
}

export async function initInsightStore(config = {}, options = {}) {
  if (!config.enabled) {
    return createDisabledInsightStore("insights disabled");
  }

  const database = options.database || config.database || { provider: "sqlite" };
  const provider = String(database.provider || "sqlite").trim() || "sqlite";

  if (provider === "supabase") {
    return new SupabaseInsightStore(config, {
      database,
      supabaseClient: options.supabaseClient
    });
  }

  if (provider !== "sqlite") {
    throw new Error(`database.provider 仅支持 sqlite 或 supabase：${provider}`);
  }

  try {
    const sqlite = await import("node:sqlite");
    const store = new SqliteInsightStore(config, sqlite.DatabaseSync);
    store.initialize();
    return store;
  } catch (error) {
    const store = new MemoryInsightStore({
      enabled: true,
      reason: `sqlite unavailable: ${error.message || String(error)}`
    });
    return store;
  }
}

class BaseInsightStore {
  saveQuestion() {}
  upsertCluster() {}
  listQuestions() {
    return { enabled: this.enabled, items: [] };
  }
  listClusters() {
    return { enabled: this.enabled, items: [] };
  }
  getOverview() {
    return emptyOverview(this.enabled);
  }
  saveReport() {}
  listReports() {
    return { enabled: this.enabled, items: [] };
  }
  getReport() {
    return null;
  }
  saveSuggestion() {}
  listSuggestions() {
    return { enabled: this.enabled, items: [] };
  }
  updateSuggestion() {
    return null;
  }
  saveFaqCandidate() {}
  listFaqCandidates() {
    return { enabled: this.enabled, items: [] };
  }
  saveSkillCandidate() {}
  listSkillCandidates() {
    return { enabled: this.enabled, items: [] };
  }
  saveLlmRun() {}
  saveJob() {}
  updateJob() {
    return null;
  }
  getJob() {
    return null;
  }
  listJobs() {
    return { enabled: this.enabled, items: [] };
  }
  close() {}
}

export class SqliteInsightStore extends BaseInsightStore {
  constructor(config, DatabaseSync) {
    super();
    this.enabled = true;
    this.reason = "";
    this.dbPath = config.dbPath || path.resolve(process.cwd(), "data/assistant.sqlite");
    this.DatabaseSync = DatabaseSync;
    this.db = null;
  }

  initialize() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new this.DatabaseSync(this.dbPath);
    const schemaPath = path.resolve(process.cwd(), "sql/data_insights_schema.sql");
    this.db.exec(fs.readFileSync(schemaPath, "utf8"));
  }

  saveQuestion(record) {
    const item = normalizeQuestionRecord(record);

    if (!item.id || !item.question) {
      return null;
    }

    const result = this.db.prepare(`
      INSERT OR IGNORE INTO questions (
        id, created_at, version_id, version_name, operator, operator_hash,
        question, question_preview, redacted_question, normalized_question, question_hash,
        answer_preview, answer_status, knowledge_hit_status, is_knowledge_gap,
        category_l1, category_l2, intent, scenario, is_version_related,
        is_platform_improvement_signal, elapsed_ms, queue_wait_ms, source_count,
        model_names_json, num_turns, total_cost_usd, remote_address_hash,
        user_agent_hash, raw_event_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.createdAt,
      item.versionId,
      item.versionName,
      item.operator,
      item.operatorHash,
      item.question,
      item.questionPreview,
      item.redactedQuestion,
      item.normalizedQuestion,
      item.questionHash,
      item.answerPreview,
      item.answerStatus,
      item.knowledgeHitStatus,
      item.isKnowledgeGap ? 1 : 0,
      item.categoryL1,
      item.categoryL2,
      item.intent,
      item.scenario,
      item.isVersionRelated ? 1 : 0,
      item.isPlatformImprovementSignal ? 1 : 0,
      item.elapsedMs,
      item.queueWaitMs,
      item.sourceCount,
      safeJsonStringify(item.modelNames, "[]"),
      item.numTurns,
      item.totalCostUsd,
      item.remoteAddressHash,
      item.userAgentHash,
      safeJsonStringify(item.rawEvent)
    );
    return result.changes > 0 ? item : null;
  }

  upsertCluster(cluster) {
    const item = normalizeCluster(cluster);

    if (!item.clusterId) {
      return null;
    }

    this.db.prepare(`
      INSERT INTO question_clusters (
        cluster_id, version_id, title, representative_question, question_hash,
        category_l1, category_l2, question_count, first_seen_at, last_seen_at,
        versions_json, sample_question_ids_json, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cluster_id) DO UPDATE SET
        title = excluded.title,
        representative_question = excluded.representative_question,
        category_l1 = excluded.category_l1,
        category_l2 = excluded.category_l2,
        question_count = question_clusters.question_count + excluded.question_count,
        first_seen_at = MIN(question_clusters.first_seen_at, excluded.first_seen_at),
        last_seen_at = MAX(question_clusters.last_seen_at, excluded.last_seen_at),
        versions_json = excluded.versions_json,
        sample_question_ids_json = excluded.sample_question_ids_json,
        updated_at = excluded.updated_at
    `).run(
      item.clusterId,
      item.versionId,
      item.title,
      item.representativeQuestion,
      item.questionHash,
      item.categoryL1,
      item.categoryL2,
      item.questionCount,
      item.firstSeenAt,
      item.lastSeenAt,
      safeJsonStringify(item.versions, "[]"),
      safeJsonStringify(item.sampleQuestionIds, "[]"),
      item.status,
      item.updatedAt
    );
    return item;
  }

  listQuestions(filter = {}) {
    const { where, params } = buildQuestionWhere(filter);
    const limit = normalizeLimit(filter.limit, DEFAULT_LIMIT);
    const rows = this.db.prepare(`
      SELECT *
      FROM questions
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limit);

    return { enabled: true, items: rows.map(publicQuestionRow) };
  }

  listClusters(filter = {}) {
    const { where, params } = buildClusterWhere(filter);
    const limit = normalizeLimit(filter.limit, DEFAULT_LIMIT);
    const rows = this.db.prepare(`
      SELECT *
      FROM question_clusters
      ${where}
      ORDER BY question_count DESC, last_seen_at DESC
      LIMIT ?
    `).all(...params, limit);

    return { enabled: true, items: rows.map(publicClusterRow) };
  }

  getOverview(filter = {}) {
    const { where, params } = buildQuestionWhere(filter);
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS totalQuestions,
        COUNT(DISTINCT version_id) AS versionCount,
        AVG(elapsed_ms) AS avgElapsedMs,
        SUM(CASE WHEN answer_status IN ('error', 'timeout', 'cancelled') THEN 1 ELSE 0 END) AS failedQuestions,
        SUM(CASE WHEN is_knowledge_gap = 1 THEN 1 ELSE 0 END) AS knowledgeGapQuestions,
        SUM(CASE WHEN knowledge_hit_status IN ('full', 'partial') THEN 1 ELSE 0 END) AS knowledgeHitQuestions,
        SUM(CASE WHEN is_platform_improvement_signal = 1 THEN 1 ELSE 0 END) AS platformSignals
      FROM questions
      ${where}
    `).get(...params);
    const clusters = this.listClusters({ ...filter, limit: MAX_LIMIT }).items;
    const totalQuestions = Number(row?.totalQuestions || 0);

    return {
      enabled: true,
      totalQuestions,
      effectiveQuestions: totalQuestions - Number(row?.failedQuestions || 0),
      versionCount: Number(row?.versionCount || 0),
      highFrequencyClusterCount: clusters.filter((cluster) => cluster.questionCount >= 2).length,
      avgElapsedMs: Math.round(Number(row?.avgElapsedMs || 0)),
      failedQuestions: Number(row?.failedQuestions || 0),
      knowledgeGapQuestions: Number(row?.knowledgeGapQuestions || 0),
      knowledgeHitQuestions: Number(row?.knowledgeHitQuestions || 0),
      platformSignals: Number(row?.platformSignals || 0)
    };
  }

  saveReport(report) {
    const item = normalizeReport(report);
    this.db.prepare(`
      INSERT OR REPLACE INTO insight_reports (
        report_id, type, title, version_id, range_start, range_end, status,
        llm_enhanced, llm_status, generated_at, report_json, markdown, metrics_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.reportId,
      item.type,
      item.title,
      item.versionId,
      item.rangeStart,
      item.rangeEnd,
      item.status,
      item.llmEnhanced ? 1 : 0,
      item.llmStatus,
      item.generatedAt,
      safeJsonStringify(item.reportJson),
      item.markdown,
      safeJsonStringify(item.metrics)
    );
    return item;
  }

  listReports(filter = {}) {
    const params = [];
    const conditions = [];

    if (filter.type) {
      conditions.push("type = ?");
      params.push(String(filter.type));
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT report_id, type, title, version_id, range_start, range_end, status,
        llm_enhanced, llm_status, generated_at, metrics_json
      FROM insight_reports
      ${where}
      ORDER BY generated_at DESC
      LIMIT ?
    `).all(...params, normalizeLimit(filter.limit, 20));

    return { enabled: true, items: rows.map(publicReportSummaryRow) };
  }

  getReport(reportId) {
    const row = this.db.prepare("SELECT * FROM insight_reports WHERE report_id = ?").get(String(reportId || ""));
    return row ? publicReportRow(row) : null;
  }

  saveSuggestion(suggestion) {
    const item = normalizeSuggestion(suggestion);
    this.db.prepare(`
      INSERT OR REPLACE INTO improvement_suggestions (
        id, report_id, type, title, description, priority, priority_score,
        status, status_note, related_cluster_ids_json, evidence_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.reportId,
      item.type,
      item.title,
      item.description,
      item.priority,
      item.priorityScore,
      item.status,
      item.statusNote,
      safeJsonStringify(item.relatedClusterIds, "[]"),
      safeJsonStringify(item.evidence),
      item.createdAt,
      item.updatedAt
    );
    return item;
  }

  listSuggestions(filter = {}) {
    const params = [];
    const conditions = [];

    if (filter.status && filter.status !== "all") {
      conditions.push("status = ?");
      params.push(String(filter.status));
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT *
      FROM improvement_suggestions
      ${where}
      ORDER BY priority_score DESC, updated_at DESC
      LIMIT ?
    `).all(...params, normalizeLimit(filter.limit, 100));

    return { enabled: true, items: rows.map(publicSuggestionRow) };
  }

  updateSuggestion(id, patch = {}) {
    const existing = this.db.prepare("SELECT * FROM improvement_suggestions WHERE id = ?").get(String(id || ""));

    if (!existing) {
      return null;
    }

    const status = OPEN_STATUSES.has(String(patch.status || "")) ? String(patch.status) : existing.status;
    const statusNote = String(patch.statusNote ?? patch.status_note ?? existing.status_note ?? "").slice(0, 1000);
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      UPDATE improvement_suggestions
      SET status = ?, status_note = ?, updated_at = ?
      WHERE id = ?
    `).run(status, statusNote, updatedAt, String(id));
    return this.listSuggestions({ status: "all", limit: MAX_LIMIT }).items.find((item) => item.id === String(id)) || null;
  }

  saveFaqCandidate(candidate) {
    const item = normalizeFaqCandidate(candidate);
    this.db.prepare(`
      INSERT OR REPLACE INTO faq_candidates (
        id, report_id, cluster_id, question, answer_summary, evidence_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.reportId,
      item.clusterId,
      item.question,
      item.answerSummary,
      safeJsonStringify(item.evidence),
      item.status,
      item.createdAt,
      item.updatedAt
    );
    return item;
  }

  listFaqCandidates(filter = {}) {
    const rows = this.db.prepare(`
      SELECT *
      FROM faq_candidates
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(normalizeLimit(filter.limit, 100));
    return { enabled: true, items: rows.map(publicFaqCandidateRow) };
  }

  saveSkillCandidate(candidate) {
    const item = normalizeSkillCandidate(candidate);
    this.db.prepare(`
      INSERT OR REPLACE INTO skill_candidates (
        id, report_id, title, trigger_scenario, input_summary, output_summary,
        evidence_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.reportId,
      item.title,
      item.triggerScenario,
      item.inputSummary,
      item.outputSummary,
      safeJsonStringify(item.evidence),
      item.status,
      item.createdAt,
      item.updatedAt
    );
    return item;
  }

  listSkillCandidates(filter = {}) {
    const rows = this.db.prepare(`
      SELECT *
      FROM skill_candidates
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(normalizeLimit(filter.limit, 100));
    return { enabled: true, items: rows.map(publicSkillCandidateRow) };
  }

  saveLlmRun(run) {
    const item = normalizeLlmRun(run);
    this.db.prepare(`
      INSERT OR REPLACE INTO insight_llm_runs (
        id, purpose, input_hash, status, elapsed_ms, model_names_json, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.purpose,
      item.inputHash,
      item.status,
      item.elapsedMs,
      safeJsonStringify(item.modelNames, "[]"),
      item.errorMessage,
      item.createdAt
    );
    return item;
  }

  saveJob(job) {
    const item = normalizeJob(job);
    this.db.prepare(`
      INSERT OR REPLACE INTO insight_jobs (
        id, type, status, payload_json, result_json, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      item.type,
      item.status,
      safeJsonStringify(item.payload),
      safeJsonStringify(item.result),
      item.errorMessage,
      item.createdAt,
      item.updatedAt
    );
    return item;
  }

  updateJob(id, patch = {}) {
    const existing = this.getJob(id);

    if (!existing) {
      return null;
    }

    const item = normalizeJob({
      ...existing,
      ...patch,
      id: existing.id,
      type: existing.type,
      payload: patch.payload ?? existing.payload,
      result: patch.result ?? existing.result,
      updatedAt: new Date().toISOString()
    });
    this.db.prepare(`
      UPDATE insight_jobs
      SET status = ?, payload_json = ?, result_json = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(
      item.status,
      safeJsonStringify(item.payload),
      safeJsonStringify(item.result),
      item.errorMessage,
      item.updatedAt,
      item.id
    );
    return item;
  }

  getJob(id) {
    const row = this.db.prepare("SELECT * FROM insight_jobs WHERE id = ?").get(String(id || ""));
    return row ? publicJobRow(row) : null;
  }

  listJobs(filter = {}) {
    const params = [];
    const conditions = [];

    if (filter.type) {
      conditions.push("type = ?");
      params.push(String(filter.type));
    }

    const statuses = normalizeStatusFilter(filter.status);

    if (statuses.length) {
      conditions.push(`status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT *
      FROM insight_jobs
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, normalizeLimit(filter.limit, 20));

    return { enabled: true, items: rows.map(publicJobRow) };
  }

  close() {
    this.db?.close();
    this.db = null;
  }
}

export class SupabaseInsightStore extends BaseInsightStore {
  constructor(config = {}, options = {}) {
    super();
    this.enabled = true;
    this.reason = "";
    this.config = config;
    this.database = options.database || config.database || {};
    const supabase = validateSupabaseInsightConfig(this.database);
    this.orgId = supabase.orgId;
    this.schema = supabase.schema;
    this.secrets = [supabase.serviceRoleKey].filter(Boolean);
    this.client = options.supabaseClient || createSupabaseServiceClient(this.database);
  }

  table(tableName) {
    if (this.schema && this.schema !== "public" && typeof this.client.schema === "function") {
      return this.client.schema(this.schema).from(tableName);
    }

    return this.client.from(tableName);
  }

  async ensureOrganization() {
    await this.upsertRow("organizations", {
      id: this.orgId,
      name: "Default organization"
    }, {
      onConflict: "id"
    }, "Supabase organizations 写入失败");
  }

  async ensureVersion(versionId, versionName) {
    const id = String(versionId || "").trim();

    if (!id || id === "all") {
      return;
    }

    await this.ensureOrganization();
    await this.upsertRow("versions", {
      id,
      org_id: this.orgId,
      name: String(versionName || id).trim() || id
    }, {
      onConflict: "id"
    }, "Supabase versions 写入失败");
  }

  async saveQuestion(record) {
    const item = normalizeQuestionRecord(record);

    if (!item.id || !item.question) {
      return null;
    }

    await this.ensureVersion(item.versionId, item.versionName);
    const existing = await this.selectOne(
      this.table("questions").select("*").eq("org_id", this.orgId).eq("id", item.id).limit(1),
      "Supabase questions 查询失败"
    );

    if (existing) {
      return null;
    }

    await this.upsertRow("questions", questionToSupabaseRow(this.orgId, item), {
      onConflict: "id",
      ignoreDuplicates: true
    }, "Supabase questions 写入失败");

    const inserted = await this.selectOne(
      this.table("questions").select("*").eq("org_id", this.orgId).eq("id", item.id).limit(1),
      "Supabase questions 查询失败"
    );
    return inserted ? publicQuestionRow(inserted) : null;
  }

  async upsertCluster(cluster) {
    const item = normalizeCluster(cluster);

    if (!item.clusterId) {
      return null;
    }

    await this.ensureVersion(item.versionId, item.versionId);
    const existingRow = await this.selectOne(
      this.table("question_clusters").select("*").eq("org_id", this.orgId).eq("cluster_id", item.clusterId).limit(1),
      "Supabase question_clusters 查询失败"
    );
    const existing = existingRow ? publicClusterRow(existingRow) : null;
    const next = existing ? {
      ...item,
      questionCount: Number(existing.questionCount || 0) + Number(item.questionCount || 0),
      firstSeenAt: minIso(existing.firstSeenAt, item.firstSeenAt),
      lastSeenAt: maxIso(existing.lastSeenAt, item.lastSeenAt),
      versions: unique([...existing.versions, ...item.versions]),
      sampleQuestionIds: unique([...existing.sampleQuestionIds, ...item.sampleQuestionIds]).slice(0, 8)
    } : item;

    await this.upsertRow("question_clusters", clusterToSupabaseRow(this.orgId, next), {
      onConflict: "cluster_id"
    }, "Supabase question_clusters 写入失败");

    const saved = await this.selectOne(
      this.table("question_clusters").select("*").eq("org_id", this.orgId).eq("cluster_id", item.clusterId).limit(1),
      "Supabase question_clusters 查询失败"
    );
    return saved ? publicClusterRow(saved) : next;
  }

  async listQuestions(filter = {}) {
    let query = this.table("questions").select("*").eq("org_id", this.orgId);

    if (filter.versionId && filter.versionId !== "all") {
      query = query.eq("version_id", String(filter.versionId));
    }

    if (filter.rangeStart || filter.startAt) {
      query = query.gte("created_at", String(filter.rangeStart || filter.startAt));
    }

    if (filter.rangeEnd || filter.endAt) {
      query = query.lte("created_at", String(filter.rangeEnd || filter.endAt));
    }

    if (filter.categoryL1) {
      query = query.eq("category_l1", String(filter.categoryL1));
    }

    const rows = await this.selectRows(
      query.order("created_at", { ascending: false }).limit(normalizeLimit(filter.limit, DEFAULT_LIMIT)),
      "Supabase questions 查询失败"
    );
    return { enabled: true, items: rows.map(publicQuestionRow) };
  }

  async listClusters(filter = {}) {
    let query = this.table("question_clusters").select("*").eq("org_id", this.orgId);

    if (filter.versionId && filter.versionId !== "all") {
      query = query.eq("version_id", String(filter.versionId));
    }

    if (filter.rangeStart || filter.startAt) {
      query = query.gte("last_seen_at", String(filter.rangeStart || filter.startAt));
    }

    if (filter.rangeEnd || filter.endAt) {
      query = query.lte("first_seen_at", String(filter.rangeEnd || filter.endAt));
    }

    const rows = await this.selectRows(
      query
        .order("question_count", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .limit(normalizeLimit(filter.limit, DEFAULT_LIMIT)),
      "Supabase question_clusters 查询失败"
    );
    return { enabled: true, items: rows.map(publicClusterRow) };
  }

  async getOverview(filter = {}) {
    const questions = (await this.listQuestions({ ...filter, limit: MAX_LIMIT })).items;
    const clusters = (await this.listClusters({ ...filter, limit: MAX_LIMIT })).items;
    const failedQuestions = questions.filter((item) => ["error", "timeout", "cancelled"].includes(item.answerStatus)).length;

    return {
      enabled: true,
      totalQuestions: questions.length,
      effectiveQuestions: questions.length - failedQuestions,
      versionCount: new Set(questions.map((item) => item.versionId)).size,
      highFrequencyClusterCount: clusters.filter((cluster) => cluster.questionCount >= 2).length,
      avgElapsedMs: average(questions.map((item) => item.elapsedMs)),
      failedQuestions,
      knowledgeGapQuestions: questions.filter((item) => item.isKnowledgeGap).length,
      knowledgeHitQuestions: questions.filter((item) => item.knowledgeHitStatus === "full" || item.knowledgeHitStatus === "partial").length,
      platformSignals: questions.filter((item) => item.isPlatformImprovementSignal).length
    };
  }

  async saveReport(report) {
    const item = normalizeReport(report);
    await this.ensureOrganization();
    await this.upsertRow("insight_reports", reportToSupabaseRow(this.orgId, item), {
      onConflict: "report_id"
    }, "Supabase insight_reports 写入失败");
    return item;
  }

  async listReports(filter = {}) {
    let query = this.table("insight_reports").select("*").eq("org_id", this.orgId);

    if (filter.type) {
      query = query.eq("type", String(filter.type));
    }

    const rows = await this.selectRows(
      query.order("generated_at", { ascending: false }).limit(normalizeLimit(filter.limit, 20)),
      "Supabase insight_reports 查询失败"
    );
    return { enabled: true, items: rows.map(publicReportSummaryRow) };
  }

  async getReport(reportId) {
    const row = await this.selectOne(
      this.table("insight_reports").select("*").eq("org_id", this.orgId).eq("report_id", String(reportId || "")).limit(1),
      "Supabase insight_reports 查询失败"
    );
    return row ? publicReportRow(row) : null;
  }

  async saveSuggestion(suggestion) {
    const item = normalizeSuggestion(suggestion);
    await this.ensureOrganization();
    await this.upsertRow("improvement_suggestions", suggestionToSupabaseRow(this.orgId, item), {
      onConflict: "id"
    }, "Supabase improvement_suggestions 写入失败");
    return item;
  }

  async listSuggestions(filter = {}) {
    let query = this.table("improvement_suggestions").select("*").eq("org_id", this.orgId);

    if (filter.status && filter.status !== "all") {
      query = query.eq("status", String(filter.status));
    }

    const rows = await this.selectRows(
      query
        .order("priority_score", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(normalizeLimit(filter.limit, 100)),
      "Supabase improvement_suggestions 查询失败"
    );
    return { enabled: true, items: rows.map(publicSuggestionRow) };
  }

  async updateSuggestion(id, patch = {}) {
    const existingRow = await this.selectOne(
      this.table("improvement_suggestions").select("*").eq("org_id", this.orgId).eq("id", String(id || "")).limit(1),
      "Supabase improvement_suggestions 查询失败"
    );

    if (!existingRow) {
      return null;
    }

    const existing = publicSuggestionRow(existingRow);
    const item = normalizeSuggestion({
      ...existing,
      ...patch,
      id: existing.id,
      reportId: existing.reportId,
      status: OPEN_STATUSES.has(String(patch.status || "")) ? String(patch.status) : existing.status,
      statusNote: patch.statusNote ?? patch.status_note ?? existing.statusNote,
      relatedClusterIds: patch.relatedClusterIds ?? existing.relatedClusterIds,
      evidence: patch.evidence ?? existing.evidence,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    });
    const row = suggestionToSupabaseRow(this.orgId, item);
    await this.updateRows(
      this.table("improvement_suggestions").update(row).eq("org_id", this.orgId).eq("id", item.id),
      "Supabase improvement_suggestions 更新失败"
    );
    return publicSuggestionRow(row);
  }

  async saveFaqCandidate(candidate) {
    const item = normalizeFaqCandidate(candidate);
    await this.ensureOrganization();
    await this.upsertRow("faq_candidates", faqCandidateToSupabaseRow(this.orgId, item), {
      onConflict: "id"
    }, "Supabase faq_candidates 写入失败");
    return item;
  }

  async listFaqCandidates(filter = {}) {
    const rows = await this.selectRows(
      this.table("faq_candidates")
        .select("*")
        .eq("org_id", this.orgId)
        .order("updated_at", { ascending: false })
        .limit(normalizeLimit(filter.limit, 100)),
      "Supabase faq_candidates 查询失败"
    );
    return { enabled: true, items: rows.map(publicFaqCandidateRow) };
  }

  async saveSkillCandidate(candidate) {
    const item = normalizeSkillCandidate(candidate);
    await this.ensureOrganization();
    await this.upsertRow("skill_candidates", skillCandidateToSupabaseRow(this.orgId, item), {
      onConflict: "id"
    }, "Supabase skill_candidates 写入失败");
    return item;
  }

  async listSkillCandidates(filter = {}) {
    const rows = await this.selectRows(
      this.table("skill_candidates")
        .select("*")
        .eq("org_id", this.orgId)
        .order("updated_at", { ascending: false })
        .limit(normalizeLimit(filter.limit, 100)),
      "Supabase skill_candidates 查询失败"
    );
    return { enabled: true, items: rows.map(publicSkillCandidateRow) };
  }

  async saveLlmRun(run) {
    const item = normalizeLlmRun(run);
    await this.ensureOrganization();
    await this.upsertRow("insight_llm_runs", llmRunToSupabaseRow(this.orgId, item), {
      onConflict: "id"
    }, "Supabase insight_llm_runs 写入失败");
    return item;
  }

  async saveJob(job) {
    const item = normalizeJob(job);
    await this.ensureOrganization();
    await this.upsertRow("insight_jobs", jobToSupabaseRow(this.orgId, item), {
      onConflict: "id"
    }, "Supabase insight_jobs 写入失败");
    return item;
  }

  async updateJob(id, patch = {}) {
    const existingRow = await this.selectOne(
      this.table("insight_jobs").select("*").eq("org_id", this.orgId).eq("id", String(id || "")).limit(1),
      "Supabase insight_jobs 查询失败"
    );

    if (!existingRow) {
      return null;
    }

    const existing = publicJobRow(existingRow);
    const item = normalizeJob({
      ...existing,
      ...patch,
      id: existing.id,
      type: existing.type,
      payload: patch.payload ?? existing.payload,
      result: patch.result ?? existing.result,
      updatedAt: new Date().toISOString()
    });
    const row = jobToSupabaseRow(this.orgId, item);
    await this.updateRows(
      this.table("insight_jobs").update(row).eq("org_id", this.orgId).eq("id", item.id),
      "Supabase insight_jobs 更新失败"
    );
    return publicJobRow(row);
  }

  async getJob(id) {
    const row = await this.selectOne(
      this.table("insight_jobs").select("*").eq("org_id", this.orgId).eq("id", String(id || "")).limit(1),
      "Supabase insight_jobs 查询失败"
    );
    return row ? publicJobRow(row) : null;
  }

  async listJobs(filter = {}) {
    let query = this.table("insight_jobs").select("*").eq("org_id", this.orgId);

    if (filter.type) {
      query = query.eq("type", String(filter.type));
    }

    const statuses = normalizeStatusFilter(filter.status);

    if (statuses.length) {
      query = query.in("status", statuses);
    }

    const rows = await this.selectRows(
      query.order("created_at", { ascending: false }).limit(normalizeLimit(filter.limit, 20)),
      "Supabase insight_jobs 查询失败"
    );
    return { enabled: true, items: rows.map(publicJobRow) };
  }

  close() {}

  async upsertRow(tableName, row, options, message) {
    const { error } = await this.table(tableName).upsert(row, options);

    if (error) {
      throw sanitizeSupabaseInsightError(message, error, this.secrets);
    }
  }

  async updateRows(query, message) {
    const { error } = await query;

    if (error) {
      throw sanitizeSupabaseInsightError(message, error, this.secrets);
    }
  }

  async selectRows(query, message) {
    const { data, error } = await query;

    if (error) {
      throw sanitizeSupabaseInsightError(message, error, this.secrets);
    }

    return Array.isArray(data) ? data : [];
  }

  async selectOne(query, message) {
    const rows = await this.selectRows(query, message);
    return rows[0] || null;
  }
}

export class MemoryInsightStore extends BaseInsightStore {
  constructor(options = {}) {
    super();
    this.enabled = Boolean(options.enabled);
    this.reason = options.reason || "";
    this.questions = new Map();
    this.clusters = new Map();
    this.reports = new Map();
    this.suggestions = new Map();
    this.faqCandidates = new Map();
    this.skillCandidates = new Map();
    this.llmRuns = new Map();
    this.jobs = new Map();
  }

  saveQuestion(record) {
    const item = normalizeQuestionRecord(record);
    if (item.id && item.question && !this.questions.has(item.id)) {
      this.questions.set(item.id, item);
      return item;
    }
    return null;
  }

  upsertCluster(cluster) {
    const item = normalizeCluster(cluster);
    const existing = this.clusters.get(item.clusterId);

    if (existing) {
      existing.questionCount += item.questionCount;
      existing.lastSeenAt = item.lastSeenAt > existing.lastSeenAt ? item.lastSeenAt : existing.lastSeenAt;
      existing.sampleQuestionIds = unique([...existing.sampleQuestionIds, ...item.sampleQuestionIds]).slice(0, 8);
      this.clusters.set(item.clusterId, existing);
      return existing;
    }

    this.clusters.set(item.clusterId, item);
    return item;
  }

  listQuestions(filter = {}) {
    return {
      enabled: this.enabled,
      items: [...this.questions.values()].filter((item) => matchFilter(item, filter)).sort(sortCreatedDesc).slice(0, normalizeLimit(filter.limit, DEFAULT_LIMIT))
    };
  }

  listClusters(filter = {}) {
    return {
      enabled: this.enabled,
      items: [...this.clusters.values()].filter((item) => matchClusterFilter(item, filter)).sort(sortClusterDesc).slice(0, normalizeLimit(filter.limit, DEFAULT_LIMIT))
    };
  }

  getOverview(filter = {}) {
    const questions = this.listQuestions({ ...filter, limit: MAX_LIMIT }).items;
    const clusters = this.listClusters({ ...filter, limit: MAX_LIMIT }).items;
    const failedQuestions = questions.filter((item) => ["error", "timeout", "cancelled"].includes(item.answerStatus)).length;

    return {
      enabled: this.enabled,
      totalQuestions: questions.length,
      effectiveQuestions: questions.length - failedQuestions,
      versionCount: new Set(questions.map((item) => item.versionId)).size,
      highFrequencyClusterCount: clusters.filter((cluster) => cluster.questionCount >= 2).length,
      avgElapsedMs: average(questions.map((item) => item.elapsedMs)),
      failedQuestions,
      knowledgeGapQuestions: questions.filter((item) => item.isKnowledgeGap).length,
      knowledgeHitQuestions: questions.filter((item) => item.knowledgeHitStatus === "full" || item.knowledgeHitStatus === "partial").length,
      platformSignals: questions.filter((item) => item.isPlatformImprovementSignal).length
    };
  }

  saveReport(report) {
    const item = normalizeReport(report);
    this.reports.set(item.reportId, item);
    return item;
  }

  listReports(filter = {}) {
    const items = [...this.reports.values()]
      .filter((item) => !filter.type || item.type === filter.type)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .slice(0, normalizeLimit(filter.limit, 20))
      .map((item) => ({ ...item, markdown: undefined, reportJson: undefined }));
    return { enabled: this.enabled, items };
  }

  getReport(reportId) {
    return this.reports.get(String(reportId || "")) || null;
  }

  saveSuggestion(suggestion) {
    const item = normalizeSuggestion(suggestion);
    this.suggestions.set(item.id, item);
    return item;
  }

  listSuggestions(filter = {}) {
    const items = [...this.suggestions.values()]
      .filter((item) => !filter.status || filter.status === "all" || item.status === filter.status)
      .sort((a, b) => b.priorityScore - a.priorityScore || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, normalizeLimit(filter.limit, 100));
    return { enabled: this.enabled, items };
  }

  updateSuggestion(id, patch = {}) {
    const item = this.suggestions.get(String(id || ""));
    if (!item) {
      return null;
    }
    item.status = OPEN_STATUSES.has(String(patch.status || "")) ? String(patch.status) : item.status;
    item.statusNote = String(patch.statusNote ?? item.statusNote ?? "").slice(0, 1000);
    item.updatedAt = new Date().toISOString();
    this.suggestions.set(item.id, item);
    return item;
  }

  saveFaqCandidate(candidate) {
    const item = normalizeFaqCandidate(candidate);
    this.faqCandidates.set(item.id, item);
    return item;
  }

  listFaqCandidates(filter = {}) {
    return { enabled: this.enabled, items: [...this.faqCandidates.values()].slice(0, normalizeLimit(filter.limit, 100)) };
  }

  saveSkillCandidate(candidate) {
    const item = normalizeSkillCandidate(candidate);
    this.skillCandidates.set(item.id, item);
    return item;
  }

  listSkillCandidates(filter = {}) {
    return { enabled: this.enabled, items: [...this.skillCandidates.values()].slice(0, normalizeLimit(filter.limit, 100)) };
  }

  saveLlmRun(run) {
    const item = normalizeLlmRun(run);
    this.llmRuns.set(item.id, item);
    return item;
  }

  saveJob(job) {
    const item = normalizeJob(job);
    this.jobs.set(item.id, item);
    return item;
  }

  updateJob(id, patch = {}) {
    const existing = this.jobs.get(String(id || ""));

    if (!existing) {
      return null;
    }

    const item = normalizeJob({
      ...existing,
      ...patch,
      id: existing.id,
      type: existing.type,
      payload: patch.payload ?? existing.payload,
      result: patch.result ?? existing.result,
      updatedAt: new Date().toISOString()
    });
    this.jobs.set(item.id, item);
    return item;
  }

  getJob(id) {
    return this.jobs.get(String(id || "")) || null;
  }

  listJobs(filter = {}) {
    const statuses = normalizeStatusFilter(filter.status);
    const items = [...this.jobs.values()]
      .filter((item) => !filter.type || item.type === filter.type)
      .filter((item) => !statuses.length || statuses.includes(item.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, normalizeLimit(filter.limit, 20));
    return { enabled: this.enabled, items };
  }
}

function buildQuestionWhere(filter) {
  const conditions = [];
  const params = [];

  if (filter.versionId && filter.versionId !== "all") {
    conditions.push("version_id = ?");
    params.push(String(filter.versionId));
  }

  if (filter.rangeStart || filter.startAt) {
    conditions.push("created_at >= ?");
    params.push(String(filter.rangeStart || filter.startAt));
  }

  if (filter.rangeEnd || filter.endAt) {
    conditions.push("created_at <= ?");
    params.push(String(filter.rangeEnd || filter.endAt));
  }

  if (filter.categoryL1) {
    conditions.push("category_l1 = ?");
    params.push(String(filter.categoryL1));
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params
  };
}

function buildClusterWhere(filter) {
  const conditions = [];
  const params = [];

  if (filter.versionId && filter.versionId !== "all") {
    conditions.push("version_id = ?");
    params.push(String(filter.versionId));
  }

  if (filter.rangeStart || filter.startAt) {
    conditions.push("last_seen_at >= ?");
    params.push(String(filter.rangeStart || filter.startAt));
  }

  if (filter.rangeEnd || filter.endAt) {
    conditions.push("first_seen_at <= ?");
    params.push(String(filter.rangeEnd || filter.endAt));
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params
  };
}

function normalizeQuestionRecord(record = {}) {
  const createdAt = normalizeIsoDate(record.createdAt || record.timestamp);
  const versionId = String(record.versionId || "default").trim() || "default";
  const question = String(record.question || "").trim().slice(0, 4000);
  const questionHash = String(record.questionHash || "").trim();

  return {
    id: String(record.id || makeId("q", [createdAt, versionId, questionHash, question])).trim(),
    createdAt,
    versionId,
    versionName: String(record.versionName || versionId).trim().slice(0, 120),
    operator: String(record.operator || "").trim().slice(0, 80),
    operatorHash: String(record.operatorHash || "").trim(),
    question,
    questionPreview: String(record.questionPreview || question).trim().slice(0, 240),
    redactedQuestion: String(record.redactedQuestion || "").trim().slice(0, 1000),
    normalizedQuestion: String(record.normalizedQuestion || "").trim().slice(0, 1000),
    questionHash,
    answerPreview: String(record.answerPreview || "").trim().slice(0, 1200),
    answerStatus: String(record.answerStatus || "unknown").trim(),
    knowledgeHitStatus: String(record.knowledgeHitStatus || "unknown").trim(),
    isKnowledgeGap: Boolean(record.isKnowledgeGap),
    categoryL1: String(record.categoryL1 || "other").trim(),
    categoryL2: String(record.categoryL2 || "unclear").trim(),
    intent: String(record.intent || "").trim().slice(0, 80),
    scenario: String(record.scenario || "").trim().slice(0, 120),
    isVersionRelated: Boolean(record.isVersionRelated),
    isPlatformImprovementSignal: Boolean(record.isPlatformImprovementSignal),
    elapsedMs: normalizeInteger(record.elapsedMs, 0),
    queueWaitMs: normalizeInteger(record.queueWaitMs, 0),
    sourceCount: normalizeInteger(record.sourceCount, 0),
    modelNames: Array.isArray(record.modelNames) ? record.modelNames.map(String).slice(0, 8) : [],
    numTurns: record.numTurns == null ? null : normalizeInteger(record.numTurns, 0),
    totalCostUsd: record.totalCostUsd == null ? null : Number(record.totalCostUsd),
    remoteAddressHash: String(record.remoteAddressHash || "").trim(),
    userAgentHash: String(record.userAgentHash || "").trim(),
    rawEvent: record.rawEvent || {}
  };
}

function normalizeCluster(cluster = {}) {
  const now = new Date().toISOString();
  const versionId = String(cluster.versionId || "default").trim() || "default";
  const questionHash = String(cluster.questionHash || "").trim();

  return {
    clusterId: String(cluster.clusterId || makeId("cluster", [versionId, questionHash])).trim(),
    versionId,
    title: String(cluster.title || "未命名问题簇").trim().slice(0, 120),
    representativeQuestion: String(cluster.representativeQuestion || "").trim().slice(0, 500),
    questionHash,
    categoryL1: String(cluster.categoryL1 || "other").trim(),
    categoryL2: String(cluster.categoryL2 || "unclear").trim(),
    questionCount: normalizeInteger(cluster.questionCount, 1),
    firstSeenAt: normalizeIsoDate(cluster.firstSeenAt || now),
    lastSeenAt: normalizeIsoDate(cluster.lastSeenAt || now),
    versions: Array.isArray(cluster.versions) ? cluster.versions.map(String) : [versionId],
    sampleQuestionIds: Array.isArray(cluster.sampleQuestionIds) ? cluster.sampleQuestionIds.map(String).slice(0, 8) : [],
    status: String(cluster.status || "open").trim(),
    updatedAt: normalizeIsoDate(cluster.updatedAt || now)
  };
}

function normalizeReport(report = {}) {
  const generatedAt = normalizeIsoDate(report.generatedAt);
  const reportId = String(report.reportId || makeId("report", [report.type, report.versionId, report.rangeStart, report.rangeEnd, generatedAt])).trim();

  return {
    reportId,
    type: String(report.type || "weekly").trim(),
    title: String(report.title || "辅助运营平台数据洞察报告").trim(),
    versionId: String(report.versionId || "all").trim() || "all",
    rangeStart: normalizeIsoDate(report.rangeStart),
    rangeEnd: normalizeIsoDate(report.rangeEnd),
    status: String(report.status || "ready").trim(),
    llmEnhanced: Boolean(report.llmEnhanced),
    llmStatus: String(report.llmStatus || "disabled").trim(),
    generatedAt,
    reportJson: report.reportJson || {},
    markdown: String(report.markdown || ""),
    metrics: report.metrics || {}
  };
}

function normalizeSuggestion(suggestion = {}) {
  const now = new Date().toISOString();
  const title = String(suggestion.title || "未命名建议").trim().slice(0, 160);
  const relatedClusterIds = Array.isArray(suggestion.relatedClusterIds) ? suggestion.relatedClusterIds.map(String) : [];

  return {
    id: String(suggestion.id || makeId("sug", [suggestion.type, title, relatedClusterIds.join("|")])).trim(),
    reportId: String(suggestion.reportId || "").trim(),
    type: String(suggestion.type || "platform").trim(),
    title,
    description: String(suggestion.description || "").trim().slice(0, 2000),
    priority: String(suggestion.priority || "P3").trim(),
    priorityScore: Number(suggestion.priorityScore || 0),
    status: OPEN_STATUSES.has(String(suggestion.status || "")) ? String(suggestion.status) : "open",
    statusNote: String(suggestion.statusNote || "").trim().slice(0, 1000),
    relatedClusterIds,
    evidence: suggestion.evidence || {},
    createdAt: normalizeIsoDate(suggestion.createdAt || now),
    updatedAt: normalizeIsoDate(suggestion.updatedAt || now)
  };
}

function normalizeFaqCandidate(candidate = {}) {
  const now = new Date().toISOString();
  const clusterId = String(candidate.clusterId || "").trim();
  const question = String(candidate.question || "").trim().slice(0, 500);

  return {
    id: String(candidate.id || makeId("faq", [clusterId, question])).trim(),
    reportId: String(candidate.reportId || "").trim(),
    clusterId,
    question,
    answerSummary: String(candidate.answerSummary || "").trim().slice(0, 1000),
    evidence: candidate.evidence || {},
    status: String(candidate.status || "open").trim(),
    createdAt: normalizeIsoDate(candidate.createdAt || now),
    updatedAt: normalizeIsoDate(candidate.updatedAt || now)
  };
}

function normalizeSkillCandidate(candidate = {}) {
  const now = new Date().toISOString();
  const title = String(candidate.title || "未命名 Skill 候选").trim().slice(0, 160);

  return {
    id: String(candidate.id || makeId("skill", [title, candidate.triggerScenario])).trim(),
    reportId: String(candidate.reportId || "").trim(),
    title,
    triggerScenario: String(candidate.triggerScenario || "").trim().slice(0, 1000),
    inputSummary: String(candidate.inputSummary || "").trim().slice(0, 1000),
    outputSummary: String(candidate.outputSummary || "").trim().slice(0, 1000),
    evidence: candidate.evidence || {},
    status: String(candidate.status || "open").trim(),
    createdAt: normalizeIsoDate(candidate.createdAt || now),
    updatedAt: normalizeIsoDate(candidate.updatedAt || now)
  };
}

function normalizeLlmRun(run = {}) {
  const createdAt = normalizeIsoDate(run.createdAt);
  return {
    id: String(run.id || makeId("llm", [run.purpose, run.inputHash, createdAt])).trim(),
    purpose: String(run.purpose || "report").trim(),
    inputHash: String(run.inputHash || "").trim(),
    status: String(run.status || "unknown").trim(),
    elapsedMs: normalizeInteger(run.elapsedMs, 0),
    modelNames: Array.isArray(run.modelNames) ? run.modelNames.map(String).slice(0, 8) : [],
    errorMessage: String(run.errorMessage || "").trim().slice(0, 1000),
    createdAt
  };
}

function normalizeJob(job = {}) {
  const now = new Date().toISOString();
  const createdAt = normalizeIsoDate(job.createdAt || now);
  const status = JOB_STATUSES.has(String(job.status || "")) ? String(job.status) : "queued";

  return {
    id: String(job.id || makeId("job", [job.type, createdAt, JSON.stringify(job.payload || {})])).trim(),
    type: String(job.type || "report_generation").trim(),
    status,
    payload: job.payload && typeof job.payload === "object" ? job.payload : {},
    result: job.result && typeof job.result === "object" ? job.result : {},
    errorMessage: String(job.errorMessage || job.error_message || "").trim().slice(0, 1000),
    createdAt,
    updatedAt: normalizeIsoDate(job.updatedAt || job.updated_at || createdAt)
  };
}

function questionToSupabaseRow(orgId, item) {
  return {
    id: item.id,
    org_id: orgId,
    created_at: item.createdAt,
    version_id: item.versionId,
    version_name: item.versionName,
    operator: item.operator,
    operator_hash: item.operatorHash,
    question: item.question,
    question_preview: item.questionPreview,
    redacted_question: item.redactedQuestion,
    normalized_question: item.normalizedQuestion,
    question_hash: item.questionHash,
    answer_preview: item.answerPreview,
    answer_status: item.answerStatus,
    knowledge_hit_status: item.knowledgeHitStatus,
    is_knowledge_gap: item.isKnowledgeGap,
    category_l1: item.categoryL1,
    category_l2: item.categoryL2,
    intent: item.intent,
    scenario: item.scenario,
    is_version_related: item.isVersionRelated,
    is_platform_improvement_signal: item.isPlatformImprovementSignal,
    elapsed_ms: item.elapsedMs,
    queue_wait_ms: item.queueWaitMs,
    source_count: item.sourceCount,
    model_names_json: item.modelNames,
    num_turns: item.numTurns,
    total_cost_usd: item.totalCostUsd,
    remote_address_hash: item.remoteAddressHash,
    user_agent_hash: item.userAgentHash,
    raw_event_json: item.rawEvent
  };
}

function clusterToSupabaseRow(orgId, item) {
  return {
    cluster_id: item.clusterId,
    org_id: orgId,
    version_id: item.versionId,
    title: item.title,
    representative_question: item.representativeQuestion,
    question_hash: item.questionHash,
    category_l1: item.categoryL1,
    category_l2: item.categoryL2,
    question_count: item.questionCount,
    first_seen_at: item.firstSeenAt,
    last_seen_at: item.lastSeenAt,
    versions_json: item.versions,
    sample_question_ids_json: item.sampleQuestionIds,
    status: item.status,
    updated_at: item.updatedAt
  };
}

function reportToSupabaseRow(orgId, item) {
  return {
    report_id: item.reportId,
    org_id: orgId,
    type: item.type,
    title: item.title,
    version_id: item.versionId,
    range_start: item.rangeStart,
    range_end: item.rangeEnd,
    status: item.status,
    llm_enhanced: item.llmEnhanced,
    llm_status: item.llmStatus,
    generated_at: item.generatedAt,
    report_json: item.reportJson,
    markdown: item.markdown,
    metrics_json: item.metrics
  };
}

function suggestionToSupabaseRow(orgId, item) {
  return {
    id: item.id,
    org_id: orgId,
    report_id: item.reportId,
    type: item.type,
    title: item.title,
    description: item.description,
    priority: item.priority,
    priority_score: item.priorityScore,
    status: item.status,
    status_note: item.statusNote,
    related_cluster_ids_json: item.relatedClusterIds,
    evidence_json: item.evidence,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

function faqCandidateToSupabaseRow(orgId, item) {
  return {
    id: item.id,
    org_id: orgId,
    report_id: item.reportId,
    cluster_id: item.clusterId,
    question: item.question,
    answer_summary: item.answerSummary,
    evidence_json: item.evidence,
    status: item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

function skillCandidateToSupabaseRow(orgId, item) {
  return {
    id: item.id,
    org_id: orgId,
    report_id: item.reportId,
    title: item.title,
    trigger_scenario: item.triggerScenario,
    input_summary: item.inputSummary,
    output_summary: item.outputSummary,
    evidence_json: item.evidence,
    status: item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

function llmRunToSupabaseRow(orgId, item) {
  return {
    id: item.id,
    org_id: orgId,
    purpose: item.purpose,
    input_hash: item.inputHash,
    status: item.status,
    elapsed_ms: item.elapsedMs,
    model_names_json: item.modelNames,
    error_message: item.errorMessage,
    created_at: item.createdAt
  };
}

function jobToSupabaseRow(orgId, item) {
  return {
    id: item.id,
    org_id: orgId,
    type: item.type,
    status: item.status,
    payload_json: item.payload,
    result_json: item.result,
    error_message: item.errorMessage,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

function publicQuestionRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    versionId: row.version_id,
    versionName: row.version_name,
    operator: row.operator,
    question: row.question,
    questionPreview: row.question_preview,
    redactedQuestion: row.redacted_question,
    normalizedQuestion: row.normalized_question,
    questionHash: row.question_hash,
    answerPreview: row.answer_preview,
    answerStatus: row.answer_status,
    knowledgeHitStatus: row.knowledge_hit_status,
    isKnowledgeGap: Boolean(row.is_knowledge_gap),
    categoryL1: row.category_l1,
    categoryL2: row.category_l2,
    intent: row.intent,
    scenario: row.scenario,
    isVersionRelated: Boolean(row.is_version_related),
    isPlatformImprovementSignal: Boolean(row.is_platform_improvement_signal),
    elapsedMs: Number(row.elapsed_ms || 0),
    queueWaitMs: Number(row.queue_wait_ms || 0),
    sourceCount: Number(row.source_count || 0),
    modelNames: parseJson(row.model_names_json, []),
    numTurns: row.num_turns == null ? null : Number(row.num_turns),
    totalCostUsd: row.total_cost_usd == null ? null : Number(row.total_cost_usd)
  };
}

function publicClusterRow(row) {
  return {
    clusterId: row.cluster_id,
    versionId: row.version_id,
    title: row.title,
    representativeQuestion: row.representative_question,
    questionHash: row.question_hash,
    categoryL1: row.category_l1,
    categoryL2: row.category_l2,
    questionCount: Number(row.question_count || 0),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    versions: parseJson(row.versions_json, []),
    sampleQuestionIds: parseJson(row.sample_question_ids_json, []),
    status: row.status,
    updatedAt: row.updated_at
  };
}

function publicReportSummaryRow(row) {
  return {
    reportId: row.report_id,
    type: row.type,
    title: row.title,
    versionId: row.version_id,
    rangeStart: row.range_start,
    rangeEnd: row.range_end,
    status: row.status,
    llmEnhanced: Boolean(row.llm_enhanced),
    llmStatus: row.llm_status,
    generatedAt: row.generated_at,
    metrics: parseJson(row.metrics_json, {})
  };
}

function publicReportRow(row) {
  return {
    ...publicReportSummaryRow(row),
    reportJson: parseJson(row.report_json, {}),
    markdown: row.markdown
  };
}

function publicSuggestionRow(row) {
  return {
    id: row.id,
    reportId: row.report_id,
    type: row.type,
    title: row.title,
    description: row.description,
    priority: row.priority,
    priorityScore: Number(row.priority_score || 0),
    status: row.status,
    statusNote: row.status_note,
    relatedClusterIds: parseJson(row.related_cluster_ids_json, []),
    evidence: parseJson(row.evidence_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicFaqCandidateRow(row) {
  return {
    id: row.id,
    reportId: row.report_id,
    clusterId: row.cluster_id,
    question: row.question,
    answerSummary: row.answer_summary,
    evidence: parseJson(row.evidence_json, {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicSkillCandidateRow(row) {
  return {
    id: row.id,
    reportId: row.report_id,
    title: row.title,
    triggerScenario: row.trigger_scenario,
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    evidence: parseJson(row.evidence_json, {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicJobRow(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: parseJson(row.payload_json, {}),
    result: parseJson(row.result_json, {}),
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeStatusFilter(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values
    .map((item) => String(item || "").trim())
    .filter((item) => JOB_STATUSES.has(item));
}

function normalizeLimit(value, fallback) {
  const number = Number(value || fallback);
  return Number.isFinite(number) ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(number))) : fallback;
}

function normalizeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function emptyOverview(enabled) {
  return {
    enabled,
    totalQuestions: 0,
    effectiveQuestions: 0,
    versionCount: 0,
    highFrequencyClusterCount: 0,
    avgElapsedMs: 0,
    failedQuestions: 0,
    knowledgeGapQuestions: 0,
    knowledgeHitQuestions: 0,
    platformSignals: 0
  };
}

function matchFilter(item, filter) {
  if (filter.versionId && filter.versionId !== "all" && item.versionId !== filter.versionId) {
    return false;
  }
  if ((filter.rangeStart || filter.startAt) && item.createdAt < String(filter.rangeStart || filter.startAt)) {
    return false;
  }
  if ((filter.rangeEnd || filter.endAt) && item.createdAt > String(filter.rangeEnd || filter.endAt)) {
    return false;
  }
  return true;
}

function matchClusterFilter(item, filter) {
  if (filter.versionId && filter.versionId !== "all" && item.versionId !== filter.versionId) {
    return false;
  }
  if ((filter.rangeStart || filter.startAt) && item.lastSeenAt < String(filter.rangeStart || filter.startAt)) {
    return false;
  }
  if ((filter.rangeEnd || filter.endAt) && item.firstSeenAt > String(filter.rangeEnd || filter.endAt)) {
    return false;
  }
  return true;
}

function sortCreatedDesc(a, b) {
  return b.createdAt.localeCompare(a.createdAt);
}

function sortClusterDesc(a, b) {
  return b.questionCount - a.questionCount || b.lastSeenAt.localeCompare(a.lastSeenAt);
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (numbers.length === 0) {
    return 0;
  }
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function validateSupabaseInsightConfig(database) {
  const supabase = database?.supabase || {};
  const url = String(supabase.url || "").trim();
  const serviceRoleKey = String(supabase.serviceRoleKey || "").trim();
  const orgId = String(supabase.orgId || "").trim();
  const schema = String(supabase.schema || "public").trim() || "public";

  if (!url) {
    throw new Error("database.supabase.url is required when database.provider=supabase.");
  }

  if (!serviceRoleKey) {
    throw new Error("database.supabase.serviceRoleKey is required when database.provider=supabase.");
  }

  if (!orgId) {
    throw new Error("database.supabase.orgId is required when database.provider=supabase.");
  }

  return { url, serviceRoleKey, orgId, schema };
}

function sanitizeSupabaseInsightError(message, error, secrets = []) {
  const rawDetail = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .map(String)
    .join("；") || "unknown error";
  const detail = secrets.reduce((text, secret) => secret ? text.split(secret).join("[redacted]") : text, rawDetail);
  return new Error(`${message}：${detail}`);
}

function minIso(left, right) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return String(left) <= String(right) ? left : right;
}

function maxIso(left, right) {
  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return String(left) >= String(right) ? left : right;
}
