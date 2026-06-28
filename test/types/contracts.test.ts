import type {
  AskStreamEvent,
  DatabaseProvider,
  HistoryStore,
  InsightStore,
  MaybePromise,
  PublicConfigResponse,
  QuestionInsight
} from "../../src/types/index.js";

const sqliteProvider: DatabaseProvider = "sqlite";
const supabaseProvider: DatabaseProvider = "supabase";

// @ts-expect-error DatabaseProvider does not accept arbitrary Postgres aliases.
const postgresProvider: DatabaseProvider = "postgres";

void sqliteProvider;
void supabaseProvider;
void postgresProvider;

function renderStreamEvent(event: AskStreamEvent): string {
  switch (event.type) {
    case "start":
      return event.requestId;
    case "queue":
      return String(event.position);
    case "history":
      return String(event.enabled);
    case "status":
      return event.message;
    case "context":
      return String(event.sourceCount);
    case "meta":
      return event.versionId;
    case "delta":
      return event.text;
    case "done":
      return event.answer;
    case "error":
      return event.message;
    default: {
      const neverEvent: never = event;
      return neverEvent;
    }
  }
}

const syncHistoryStore: HistoryStore = {
  enabled: true,
  record() {
    return true;
  },
  listHistory() {
    return { enabled: true, items: [] };
  },
  listFrequent() {
    return { enabled: true, items: [] };
  },
  listCategories() {
    return { enabled: true, items: [] };
  }
};

const asyncHistoryStore: HistoryStore = {
  enabled: true,
  async record() {
    return true;
  },
  async listHistory() {
    return { enabled: true, items: [] };
  },
  async listFrequent() {
    return { enabled: true, items: [] };
  },
  async listCategories() {
    return { enabled: true, items: [] };
  }
};

const syncInsightStore: InsightStore = {
  enabled: true,
  saveQuestion(question) {
    return question;
  }
};

const asyncInsightStore: InsightStore = {
  enabled: true,
  async saveQuestion(question) {
    return question;
  }
};

const maybeNumber: MaybePromise<number> = Promise.resolve(1);
const maybeString: MaybePromise<string> = "ready";

const publicConfig: PublicConfigResponse = {
  host: "127.0.0.1",
  port: 4878,
  model: "",
  displayModel: "Claude Code 默认",
  claudeBare: false,
  maxTurns: 8,
  timeoutMs: 600000,
  retrievalMode: "claude-tools",
  contextMaxChars: 8000,
  historyMaxMessages: 8,
  historyMaxChars: 6000,
  defaultVersionId: "default",
  queue: {
    implementationStatus: "implemented",
    stats: {
      activeCount: 0,
      queuedCount: 0
    }
  },
  telemetry: {
    enabled: false,
    requestedEnabled: false,
    implementationStatus: "reserved",
    serviceName: "modelmate",
    exportProtocol: "http/protobuf",
    enableClaudeTelemetry: false,
    requestedClaudeTelemetry: false
  },
  skills: {
    enabled: true,
    implementationStatus: "candidate-only",
    candidateGenerationEnabled: true,
    faqDirectAnswerEnabled: false,
    requestedFaqDirectAnswerEnabled: false,
    minFaqHitCount: 3,
    cacheTtlMs: 300000
  },
  capabilities: {},
  historyStore: {
    enabled: true,
    retentionDays: 180
  },
  database: {
    provider: "supabase",
    supabase: {
      url: "https://modelmate.example.supabase.co",
      schema: "public"
    }
  },
  insights: {
    enabled: true,
    llmEnhanced: false,
    defaultRangeDays: 30,
    topClusterLimit: 10,
    samplePerCluster: 3,
    maxPromptChars: 12000,
    analysisTimeoutMs: 600000,
    redactionEnabled: true,
    reportRetentionDays: 180,
    jobRetentionDays: 30
  },
  warnings: [],
  allowedTools: ["Read", "Glob", "Grep", "LS"],
  disallowedTools: ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash", "WebFetch", "WebSearch"]
};

const publicConfigWithSecret: PublicConfigResponse = {
  ...publicConfig,
  database: {
    provider: "supabase",
    supabase: {
      url: "https://modelmate.example.supabase.co",
      schema: "public",
      // @ts-expect-error Public database config must not expose serviceRoleKey.
      serviceRoleKey: "service-role-secret"
    }
  }
};

const publicConfigWithOrg: PublicConfigResponse = {
  ...publicConfig,
  database: {
    provider: "supabase",
    supabase: {
      url: "https://modelmate.example.supabase.co",
      schema: "public",
      // @ts-expect-error Public database config must not expose orgId.
      orgId: "00000000-0000-0000-0000-000000000001"
    }
  }
};

const question: QuestionInsight = {
  id: "question-1",
  org_id: "org-1",
  version_id: "default",
  question_hash: "hash",
  normalized_question: "how to inspect orders",
  category_l1: "ops",
  category_l2: "orders",
  asked_at: "2026-06-28T00:00:00.000Z",
  created_at: "2026-06-28T00:00:00.000Z"
};

void renderStreamEvent;
void syncHistoryStore;
void asyncHistoryStore;
void syncInsightStore;
void asyncInsightStore;
void maybeNumber;
void maybeString;
void publicConfigWithSecret;
void publicConfigWithOrg;
void question;
