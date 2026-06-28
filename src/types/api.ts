import type {
  AssistantVersion,
  DatabaseProvider,
  FaqCandidate,
  ImprovementSuggestion,
  InsightJob,
  InsightReport,
  IsoTimestamp,
  JsonRecord,
  QuestionCluster,
  QuestionInsight,
  SkillCandidate,
  VersionId
} from "./domain.js";

export interface PublicConfigResponse {
  host: string;
  port: number;
  model: string;
  displayModel: string;
  claudeBare: boolean;
  maxTurns: number;
  timeoutMs: number;
  retrievalMode: string;
  contextMaxChars: number;
  historyMaxMessages: number;
  historyMaxChars: number;
  defaultVersionId: VersionId;
  queue: {
    stats: QueueStats;
    [key: string]: unknown;
  };
  telemetry: PublicTelemetryConfig;
  skills: PublicSkillsConfig;
  capabilities: Record<string, PublicCapability>;
  historyStore: {
    enabled: boolean;
    retentionDays: number;
  };
  database: {
    provider: DatabaseProvider;
    supabase: {
      url: string;
      schema: string;
    };
  };
  insights: PublicInsightsConfig;
  warnings: string[];
  allowedTools: string[];
  disallowedTools: string[];
}

export interface VersionsResponse {
  versions: AssistantVersion[];
  defaultVersionId: VersionId;
}

export interface AskRequest {
  versionId: VersionId;
  question: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  stream?: boolean;
}

export interface AskResponse {
  answer: string;
  versionId: VersionId;
  requestId?: string;
  elapsedMs?: number;
  sources?: Array<Record<string, unknown>>;
  modelNames?: string[];
  history?: {
    recorded: boolean;
  };
}

export type AskStreamEvent =
  | { type: "start"; requestId: string; versionId: VersionId }
  | { type: "queue"; position: number; activeCount?: number; queuedCount?: number }
  | { type: "history"; enabled: boolean; recorded?: boolean }
  | { type: "status"; message: string; stage?: string }
  | { type: "context"; sourceCount: number; sources?: Array<Record<string, unknown>> }
  | { type: "meta"; versionId: VersionId; modelNames?: string[]; elapsedMs?: number }
  | { type: "delta"; text: string }
  | { type: "done"; answer: string; elapsedMs?: number }
  | { type: "error"; message: string; code?: string };

export interface HistoryResponse {
  enabled: boolean;
  items: HistoryItem[];
}

export interface HistoryItem {
  createdAt: IsoTimestamp;
  versionId: VersionId;
  versionName?: string;
  operator?: string;
  question: string;
  answerPreview?: string;
  category?: string;
  elapsedMs?: number | null;
  quickReply?: boolean;
  historyMessageCount?: number | null;
  sourceCount?: number | null;
  modelNames?: string[];
  numTurns?: number | null;
  totalCostUsd?: number | null;
}

export interface FrequentQuestionsResponse {
  enabled: boolean;
  items: FrequentQuestionItem[];
}

export interface FrequentQuestionItem {
  questionHash: string;
  normalizedQuestion: string;
  sampleQuestion: string;
  category?: string;
  hitCount: number;
  firstAskedAt?: IsoTimestamp;
  lastAskedAt?: IsoTimestamp;
  avgElapsedMs?: number;
  quickReplyCount?: number;
}

export interface CategoriesResponse {
  enabled: boolean;
  items: CategoryItem[];
}

export interface CategoryItem {
  category: string;
  questionCount: number;
  lastAskedAt?: IsoTimestamp;
  avgElapsedMs?: number;
  sourceCount?: number;
  quickReplyCount?: number;
}

export interface InsightOverviewResponse {
  enabled: boolean;
  totalQuestions: number;
  effectiveQuestions: number;
  versionCount: number;
  highFrequencyClusterCount: number;
  avgElapsedMs: number;
  failedQuestions: number;
  knowledgeGapQuestions: number;
  knowledgeHitQuestions: number;
  platformSignals: number;
}

export interface InsightCategoriesResponse {
  enabled: boolean;
  items: Array<{
    category: string;
    questionCount: number;
    percentage?: number;
  }>;
}

export interface InsightFrequentQuestionsResponse {
  enabled: boolean;
  items: QuestionCluster[];
}

export interface InsightVersionsResponse {
  enabled: boolean;
  items: Array<{
    versionId: VersionId;
    questionCount: number;
    lastAskedAt?: IsoTimestamp;
  }>;
}

export interface KnowledgeGapsResponse {
  enabled: boolean;
  items: QuestionInsight[];
}

export interface ImprovementSuggestionsResponse {
  enabled: boolean;
  items: ImprovementSuggestion[];
}

export interface ReportGenerateRequest {
  type?: string;
  versionId?: VersionId | "all";
  rangeDays?: number;
  llmEnhanced?: boolean;
}

export interface ReportGenerateResponse {
  reportId: string;
  report: InsightReport;
  job?: InsightJob;
}

export interface ReportJobsResponse {
  enabled: boolean;
  items: InsightJob[];
}

export interface ReportsResponse {
  enabled: boolean;
  items: InsightReport[];
}

export interface ReportDetailResponse {
  enabled?: boolean;
  report: InsightReport;
  suggestions?: ImprovementSuggestion[];
  faqCandidates?: FaqCandidate[];
  skillCandidates?: SkillCandidate[];
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: JsonRecord;
}

export interface QueueStats {
  activeCount: number;
  queuedCount: number;
  [key: string]: unknown;
}

export interface PublicCapability {
  key: string;
  name: string;
  status: string;
  statusLabel: string;
  summary: string;
  [key: string]: unknown;
}

export interface PublicTelemetryConfig {
  enabled: boolean;
  requestedEnabled: boolean;
  implementationStatus: string;
  serviceName?: string;
  exportProtocol?: string;
  enableClaudeTelemetry: boolean;
  requestedClaudeTelemetry: boolean;
}

export interface PublicSkillsConfig {
  enabled: boolean;
  implementationStatus: string;
  candidateGenerationEnabled: boolean;
  faqDirectAnswerEnabled: boolean;
  requestedFaqDirectAnswerEnabled: boolean;
  minFaqHitCount?: number;
  cacheTtlMs?: number;
}

export interface PublicInsightsConfig {
  enabled: boolean;
  llmEnhanced: boolean;
  defaultRangeDays?: number;
  topClusterLimit?: number;
  samplePerCluster?: number;
  maxPromptChars?: number;
  analysisTimeoutMs?: number;
  redactionEnabled: boolean;
  reportRetentionDays?: number;
  jobRetentionDays?: number;
}
