import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { createSupabaseServiceClient } from "./supabase-client.mjs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const CATEGORY_RULES = [
  {
    category: "接口排障",
    patterns: [/接口|api|http|超时|timeout|500|502|503|报错|异常|失败|故障|排障|排查|错误码/i]
  },
  {
    category: "配置部署",
    patterns: [/配置|config|部署|发布|环境|env|启动|端口|域名|灰度|回滚|版本/i]
  },
  {
    category: "日志监控",
    patterns: [/日志|log|监控|告警|指标|metric|trace|链路|观测|otel|opentelemetry/i]
  },
  {
    category: "代码定位",
    patterns: [/代码|函数|方法|类|模块|文件|源码|runner|server|实现|调用流程|阅读\s*src/i]
  },
  {
    category: "知识文档",
    patterns: [/readme|文档|手册|知识库|说明|依据|引用|资料|流程/i]
  },
  {
    category: "系统使用",
    patterns: [/怎么用|如何使用|助手|界面|会话|历史|版本选择|功能|优化建议/i]
  }
];

export function createDisabledHistoryStore(reason = "") {
  return {
    enabled: false,
    reason,
    record() {},
    listHistory() {
      return { enabled: false, reason, items: [] };
    },
    listFrequent() {
      return { enabled: false, reason, items: [] };
    },
    listCategories() {
      return { enabled: false, reason, items: [] };
    },
    close() {}
  };
}

export async function createHistoryStore(config, options = {}) {
  if (!config?.enabled) {
    return createDisabledHistoryStore("historyStore disabled");
  }

  const database = options.database || { provider: "sqlite" };

  if (database.provider === "supabase") {
    const store = new SupabaseHistoryStore(config, {
      database,
      supabaseClient: options.supabaseClient
    });
    return store;
  }

  const store = new SqliteHistoryStore(config);
  store.initialize();

  if (options.backfill !== false) {
    await store.backfillFromJsonl();
  }

  return store;
}

export class SupabaseHistoryStore {
  constructor(config = {}, options = {}) {
    this.enabled = true;
    this.config = config;
    this.database = options.database || {};
    this.orgId = validateSupabaseHistoryConfig(this.database);
    this.client = options.supabaseClient || createSupabaseServiceClient(this.database);
  }

  async record(entry) {
    const normalizedEntry = normalizeEntry(entry);

    if (!normalizedEntry.question) {
      return false;
    }

    await this.ensureOrganizationAndVersion(normalizedEntry);
    await this.upsert("ask_events", {
      org_id: this.orgId,
      event_key: normalizedEntry.eventKey,
      created_at: normalizedEntry.createdAt,
      version_id: normalizedEntry.versionId,
      version_name: normalizedEntry.versionName,
      operator: normalizedEntry.operator,
      question: normalizedEntry.question,
      normalized_question: normalizedEntry.normalizedQuestion,
      question_hash: normalizedEntry.questionHash,
      answer_preview: normalizedEntry.answerPreview,
      category: normalizedEntry.category,
      elapsed_ms: normalizedEntry.elapsedMs,
      quick_reply: normalizedEntry.quickReply,
      history_message_count: normalizedEntry.historyMessageCount,
      source_count: normalizedEntry.sourceCount,
      model_names_json: normalizedEntry.modelNames,
      num_turns: normalizedEntry.numTurns,
      total_cost_usd: normalizedEntry.totalCostUsd
    }, {
      onConflict: "org_id,event_key",
      ignoreDuplicates: true
    });

    return true;
  }

  async listHistory({ versionId, limit = DEFAULT_LIMIT, category = "" }) {
    let query = this.client
      .from("ask_events")
      .select("id, created_at, version_id, version_name, operator, question, answer_preview, category, elapsed_ms, quick_reply, history_message_count, source_count, model_names_json, num_turns, total_cost_usd")
      .eq("org_id", this.orgId)
      .eq("version_id", String(versionId || ""))
      .order("created_at", { ascending: false })
      .limit(normalizeLimit(limit));

    if (category) {
      query = query.eq("category", String(category));
    }

    const rows = await this.selectRows(query, "Supabase 历史记录查询失败");
    return { enabled: true, items: rows.map(publicSupabaseHistoryRow) };
  }

  async listFrequent({ versionId, limit = 10 }) {
    const query = this.client
      .from("ask_events")
      .select("created_at, question, normalized_question, question_hash, category, elapsed_ms, quick_reply")
      .eq("org_id", this.orgId)
      .eq("version_id", String(versionId || ""))
      .order("created_at", { ascending: false })
      .limit(1000);
    const rows = await this.selectRows(query, "Supabase 高频问题查询失败");
    const groups = new Map();

    for (const row of rows) {
      const key = `${row.question_hash || ""}\u0000${row.normalized_question || ""}\u0000${row.category || ""}`;
      const existing = groups.get(key) || {
        questionHash: row.question_hash || "",
        normalizedQuestion: row.normalized_question || "",
        sampleQuestion: row.question || "",
        category: row.category || "",
        hitCount: 0,
        firstAskedAt: row.created_at,
        lastAskedAt: row.created_at,
        elapsedTotal: 0,
        quickReplyCount: 0
      };

      existing.hitCount += 1;
      existing.firstAskedAt = minIso(existing.firstAskedAt, row.created_at);
      existing.lastAskedAt = maxIso(existing.lastAskedAt, row.created_at);
      existing.elapsedTotal += Number(row.elapsed_ms || 0);
      existing.quickReplyCount += row.quick_reply ? 1 : 0;
      groups.set(key, existing);
    }

    return {
      enabled: true,
      items: [...groups.values()]
        .sort((left, right) => right.hitCount - left.hitCount || String(right.lastAskedAt || "").localeCompare(String(left.lastAskedAt || "")))
        .slice(0, normalizeLimit(limit, 10))
        .map((item) => ({
          questionHash: item.questionHash,
          normalizedQuestion: item.normalizedQuestion,
          sampleQuestion: item.sampleQuestion,
          category: item.category,
          hitCount: item.hitCount,
          firstAskedAt: item.firstAskedAt,
          lastAskedAt: item.lastAskedAt,
          avgElapsedMs: Math.round(item.elapsedTotal / Math.max(1, item.hitCount)),
          quickReplyCount: item.quickReplyCount
        }))
    };
  }

  async listCategories({ versionId }) {
    const query = this.client
      .from("ask_events")
      .select("created_at, category, elapsed_ms, source_count, quick_reply")
      .eq("org_id", this.orgId)
      .eq("version_id", String(versionId || ""))
      .order("created_at", { ascending: false })
      .limit(5000);
    const rows = await this.selectRows(query, "Supabase 分类统计查询失败");
    const groups = new Map();

    for (const row of rows) {
      const category = row.category || "";
      const existing = groups.get(category) || {
        category,
        questionCount: 0,
        lastAskedAt: row.created_at,
        elapsedTotal: 0,
        sourceCount: 0,
        quickReplyCount: 0
      };

      existing.questionCount += 1;
      existing.lastAskedAt = maxIso(existing.lastAskedAt, row.created_at);
      existing.elapsedTotal += Number(row.elapsed_ms || 0);
      existing.sourceCount += Number(row.source_count || 0);
      existing.quickReplyCount += row.quick_reply ? 1 : 0;
      groups.set(category, existing);
    }

    return {
      enabled: true,
      items: [...groups.values()]
        .sort((left, right) => right.questionCount - left.questionCount || String(right.lastAskedAt || "").localeCompare(String(left.lastAskedAt || "")))
        .map((item) => ({
          category: item.category,
          questionCount: item.questionCount,
          lastAskedAt: item.lastAskedAt,
          avgElapsedMs: Math.round(item.elapsedTotal / Math.max(1, item.questionCount)),
          sourceCount: item.sourceCount,
          quickReplyCount: item.quickReplyCount
        }))
    };
  }

  close() {}

  async ensureOrganizationAndVersion(entry) {
    await this.upsert("organizations", {
      id: this.orgId,
      name: "Default organization"
    }, {
      onConflict: "id"
    });
    await this.upsert("versions", {
      id: entry.versionId,
      org_id: this.orgId,
      name: entry.versionName || entry.versionId
    }, {
      onConflict: "id"
    });
  }

  async upsert(table, row, options) {
    const { error } = await this.client.from(table).upsert(row, options);

    if (error) {
      throw sanitizeSupabaseError(`Supabase ${table} 写入失败`, error);
    }
  }

  async selectRows(query, message) {
    const { data, error } = await query;

    if (error) {
      throw sanitizeSupabaseError(message, error);
    }

    return Array.isArray(data) ? data : [];
  }
}

export class SqliteHistoryStore {
  constructor(config) {
    this.enabled = true;
    this.dbPath = config.dbPath;
    this.jsonlPath = config.jsonlPath;
    this.retentionDays = Number(config.retentionDays || 180);
    this.db = null;
  }

  initialize() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS ask_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        version_id TEXT NOT NULL,
        version_name TEXT NOT NULL,
        operator TEXT NOT NULL,
        question TEXT NOT NULL,
        normalized_question TEXT NOT NULL,
        question_hash TEXT NOT NULL,
        answer_preview TEXT NOT NULL,
        category TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        quick_reply INTEGER NOT NULL DEFAULT 0,
        history_message_count INTEGER NOT NULL DEFAULT 0,
        source_count INTEGER NOT NULL DEFAULT 0,
        model_names_json TEXT NOT NULL DEFAULT '[]',
        num_turns INTEGER,
        total_cost_usd REAL
      );
      CREATE INDEX IF NOT EXISTS idx_ask_events_version_created
        ON ask_events (version_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_ask_events_version_question
        ON ask_events (version_id, question_hash);
      CREATE INDEX IF NOT EXISTS idx_ask_events_version_category
        ON ask_events (version_id, category);
    `);
    this.pruneExpired();
  }

  async backfillFromJsonl() {
    if (!this.jsonlPath || !fs.existsSync(this.jsonlPath)) {
      return;
    }

    const reader = readline.createInterface({
      input: fs.createReadStream(this.jsonlPath, { encoding: "utf8" }),
      crlfDelay: Infinity
    });

    for await (const line of reader) {
      const text = line.trim();

      if (!text) {
        continue;
      }

      try {
        this.record(JSON.parse(text));
      } catch {
        // Keep raw JSONL append-only. Bad legacy lines should not block startup.
      }
    }
  }

  record(entry) {
    const normalizedEntry = normalizeEntry(entry);

    if (!normalizedEntry.question) {
      return false;
    }

    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO ask_events (
        event_key,
        created_at,
        version_id,
        version_name,
        operator,
        question,
        normalized_question,
        question_hash,
        answer_preview,
        category,
        elapsed_ms,
        quick_reply,
        history_message_count,
        source_count,
        model_names_json,
        num_turns,
        total_cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = statement.run(
      normalizedEntry.eventKey,
      normalizedEntry.createdAt,
      normalizedEntry.versionId,
      normalizedEntry.versionName,
      normalizedEntry.operator,
      normalizedEntry.question,
      normalizedEntry.normalizedQuestion,
      normalizedEntry.questionHash,
      normalizedEntry.answerPreview,
      normalizedEntry.category,
      normalizedEntry.elapsedMs,
      normalizedEntry.quickReply ? 1 : 0,
      normalizedEntry.historyMessageCount,
      normalizedEntry.sourceCount,
      JSON.stringify(normalizedEntry.modelNames),
      normalizedEntry.numTurns,
      normalizedEntry.totalCostUsd
    );
    return result.changes > 0;
  }

  listHistory({ versionId, limit = DEFAULT_LIMIT, category = "" }) {
    const safeLimit = normalizeLimit(limit);
    const params = [String(versionId || ""), safeLimit];
    let where = "version_id = ?";

    if (category) {
      where += " AND category = ?";
      params.splice(1, 0, String(category));
    }

    const rows = this.db.prepare(`
      SELECT
        id,
        created_at AS createdAt,
        version_id AS versionId,
        version_name AS versionName,
        operator,
        question,
        answer_preview AS answerPreview,
        category,
        elapsed_ms AS elapsedMs,
        quick_reply AS quickReply,
        history_message_count AS historyMessageCount,
        source_count AS sourceCount,
        model_names_json AS modelNamesJson,
        num_turns AS numTurns,
        total_cost_usd AS totalCostUsd
      FROM ask_events
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...params);

    return { enabled: true, items: rows.map(publicHistoryRow) };
  }

  listFrequent({ versionId, limit = 10 }) {
    const safeLimit = normalizeLimit(limit, 10);
    const rows = this.db.prepare(`
      SELECT
        question_hash AS questionHash,
        normalized_question AS normalizedQuestion,
        category,
        COUNT(*) AS hitCount,
        MIN(created_at) AS firstAskedAt,
        MAX(created_at) AS lastAskedAt,
        AVG(elapsed_ms) AS avgElapsedMs,
        SUM(quick_reply) AS quickReplyCount,
        (
          SELECT question
          FROM ask_events latest
          WHERE latest.version_id = events.version_id
            AND latest.question_hash = events.question_hash
          ORDER BY latest.created_at DESC, latest.id DESC
          LIMIT 1
        ) AS sampleQuestion
      FROM ask_events events
      WHERE version_id = ?
      GROUP BY question_hash, normalized_question, category
      ORDER BY hitCount DESC, lastAskedAt DESC
      LIMIT ?
    `).all(String(versionId || ""), safeLimit);

    return {
      enabled: true,
      items: rows.map((row) => ({
        questionHash: row.questionHash,
        normalizedQuestion: row.normalizedQuestion,
        sampleQuestion: row.sampleQuestion,
        category: row.category,
        hitCount: Number(row.hitCount || 0),
        firstAskedAt: row.firstAskedAt,
        lastAskedAt: row.lastAskedAt,
        avgElapsedMs: Math.round(Number(row.avgElapsedMs || 0)),
        quickReplyCount: Number(row.quickReplyCount || 0)
      }))
    };
  }

  listCategories({ versionId }) {
    const rows = this.db.prepare(`
      SELECT
        category,
        COUNT(*) AS questionCount,
        MAX(created_at) AS lastAskedAt,
        AVG(elapsed_ms) AS avgElapsedMs,
        SUM(source_count) AS sourceCount,
        SUM(quick_reply) AS quickReplyCount
      FROM ask_events
      WHERE version_id = ?
      GROUP BY category
      ORDER BY questionCount DESC, lastAskedAt DESC
    `).all(String(versionId || ""));

    return {
      enabled: true,
      items: rows.map((row) => ({
        category: row.category,
        questionCount: Number(row.questionCount || 0),
        lastAskedAt: row.lastAskedAt,
        avgElapsedMs: Math.round(Number(row.avgElapsedMs || 0)),
        sourceCount: Number(row.sourceCount || 0),
        quickReplyCount: Number(row.quickReplyCount || 0)
      }))
    };
  }

  pruneExpired() {
    if (!Number.isFinite(this.retentionDays) || this.retentionDays <= 0) {
      return;
    }

    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare("DELETE FROM ask_events WHERE created_at < ?").run(cutoff);
  }

  close() {
    this.db?.close();
    this.db = null;
  }
}

export function normalizeQuestion(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[`*_~#[\]{}()<>:：,，.。!?！？;；'"“”‘’/\\|+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

export function hashQuestion(normalizedQuestion) {
  return hashString(String(normalizedQuestion || "")).slice(0, 32);
}

export function classifyQuestion(question) {
  const text = String(question || "").normalize("NFKC");

  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.category;
    }
  }

  if (/你好|hello|hi|在吗|谢谢/i.test(text.trim())) {
    return "系统使用";
  }

  return "其他";
}

function normalizeEntry(entry) {
  const createdAt = normalizeIsoDate(entry.timestamp || entry.createdAt);
  const question = String(entry.question || "").trim().slice(0, 4000);
  const answerPreview = String(entry.answerPreview || entry.answer || "").trim().slice(0, 1200);
  const normalizedQuestion = normalizeQuestion(question);
  const questionHash = hashQuestion(normalizedQuestion);
  const versionId = String(entry.versionId || "default").trim() || "default";
  const operator = String(entry.operator || "未填写账号").trim().slice(0, 80) || "未填写账号";
  const modelNames = Array.isArray(entry.claude?.modelNames) ? entry.claude.modelNames.map(String).slice(0, 8) : [];
  const eventKey = hashString([
    createdAt,
    versionId,
    operator,
    questionHash,
    question.slice(0, 500),
    answerPreview.slice(0, 240)
  ].join("\u0000"));

  return {
    eventKey,
    createdAt,
    versionId,
    versionName: String(entry.versionName || versionId).trim().slice(0, 120),
    operator,
    question,
    normalizedQuestion,
    questionHash,
    answerPreview,
    category: classifyQuestion(question),
    elapsedMs: normalizeInteger(entry.elapsedMs, 0),
    quickReply: Boolean(entry.quickReply),
    historyMessageCount: normalizeInteger(entry.historyMessageCount, 0),
    sourceCount: Array.isArray(entry.sources) ? entry.sources.length : normalizeInteger(entry.sourceCount, 0),
    modelNames,
    numTurns: entry.claude?.numTurns == null ? null : normalizeInteger(entry.claude.numTurns, 0),
    totalCostUsd: entry.claude?.totalCostUsd == null ? null : Number(entry.claude.totalCostUsd)
  };
}

function publicHistoryRow(row) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    versionId: row.versionId,
    versionName: row.versionName,
    operator: row.operator,
    question: row.question,
    answerPreview: row.answerPreview,
    category: row.category,
    elapsedMs: Number(row.elapsedMs || 0),
    quickReply: Boolean(row.quickReply),
    historyMessageCount: Number(row.historyMessageCount || 0),
    sourceCount: Number(row.sourceCount || 0),
    modelNames: parseJsonArray(row.modelNamesJson),
    numTurns: row.numTurns == null ? null : Number(row.numTurns),
    totalCostUsd: row.totalCostUsd == null ? null : Number(row.totalCostUsd)
  };
}

function publicSupabaseHistoryRow(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    versionId: row.version_id,
    versionName: row.version_name,
    operator: row.operator,
    question: row.question,
    answerPreview: row.answer_preview,
    category: row.category,
    elapsedMs: Number(row.elapsed_ms || 0),
    quickReply: Boolean(row.quick_reply),
    historyMessageCount: Number(row.history_message_count || 0),
    sourceCount: Number(row.source_count || 0),
    modelNames: Array.isArray(row.model_names_json) ? row.model_names_json : parseJsonArray(row.model_names_json),
    numTurns: row.num_turns == null ? null : Number(row.num_turns),
    totalCostUsd: row.total_cost_usd == null ? null : Number(row.total_cost_usd)
  };
}

function validateSupabaseHistoryConfig(database) {
  const supabase = database?.supabase || {};
  const url = String(supabase.url || "").trim();
  const serviceRoleKey = String(supabase.serviceRoleKey || "").trim();
  const orgId = String(supabase.orgId || "").trim();

  if (!url) {
    throw new Error("database.supabase.url is required when database.provider=supabase.");
  }

  if (!serviceRoleKey) {
    throw new Error("database.supabase.serviceRoleKey is required when database.provider=supabase.");
  }

  if (!orgId) {
    throw new Error("database.supabase.orgId is required when database.provider=supabase.");
  }

  return orgId;
}

function sanitizeSupabaseError(message, error) {
  const detail = String(error?.message || error?.details || error?.hint || error?.code || "unknown error");
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

function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
  const limit = Number(value || fallback);

  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function normalizeIsoDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function normalizeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hashString(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
