import type {
  AssistantVersion,
  DatabaseProvider,
  IsoTimestamp,
  JsonRecord,
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
  operator?: string;
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
  | {
      type: "start";
      jobId?: string;
      requestId?: string;
      operator?: string;
      versionId: VersionId;
      versionName?: string;
      historyCount?: number;
      startedAt?: IsoTimestamp;
    }
  | {
      type: "queue";
      status?: string;
      position?: number;
      activeCount?: number;
      queuedCount?: number;
      maxConcurrent?: number;
      queueWaitMs?: number;
      message?: string;
    }
  | { type: "history"; enabled?: boolean; count?: number; recorded?: boolean; versionId?: VersionId }
  | { type: "status"; message: string; stage?: string }
  | { type: "context"; sourceCount?: number; sources?: Array<Record<string, unknown>>; context?: JsonRecord; versionId?: VersionId }
  | { type: "meta"; versionId?: VersionId; model?: string; modelNames?: string[]; sessionId?: string; elapsedMs?: number }
  | { type: "delta"; text: string }
  | { type: "done"; answer?: string; elapsedMs?: number; payload?: AskResponse }
  | { type: "error"; message?: string; error?: string; code?: string; statusCode?: number; retryAfterMs?: number; queue?: JsonRecord | null };

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
  range: InsightRange;
  versionId: VersionId | "all";
  metrics: {
    totalQuestions: number;
    effectiveQuestions: number;
    highFrequencyClusterCount: number;
    knowledgeGapRate: number;
    knowledgeHitRate: number;
    repetitionRate: number;
    avgElapsedMs: number;
    avgQueueWaitMs: number;
    failureRate: number;
    aiOpportunityCount: number;
  };
  counts: {
    failedQuestions: number;
    knowledgeGapQuestions: number;
    knowledgeHitQuestions: number;
    repeatedQuestions: number;
    platformSignals: number;
    versionCount: number;
  };
}

export interface InsightCategoriesResponse {
  enabled: boolean;
  items: InsightCategoryItem[];
}

export interface InsightCategoryItem {
  categoryL1: string;
  categoryL1Name: string;
  categoryL2: string;
  categoryL2Name: string;
  questionCount: number;
  percent: number;
  avgElapsedMs: number;
  knowledgeGapCount: number;
}

export interface InsightFrequentQuestionsResponse {
  enabled: boolean;
  items: InsightFrequentQuestionItem[];
}

export interface InsightFrequentQuestionItem {
  clusterId: string;
  title: string;
  representativeQuestion: string;
  questionCount: number;
  categoryL1: string;
  categoryL1Name: string;
  categoryL2: string;
  categoryL2Name: string;
  versionId: VersionId;
  firstSeenAt: IsoTimestamp;
  lastSeenAt: IsoTimestamp;
  trend: string;
  answerStatus: string;
  knowledgeHitStatus: string;
  suggestedAction: string;
}

export interface InsightVersionsResponse {
  enabled: boolean;
  items: InsightVersionItem[];
}

export interface InsightVersionItem {
  versionId: VersionId;
  versionName: string;
  questionCount: number;
  failureRate: number;
  knowledgeGapRate: number;
  avgElapsedMs: number;
}

export interface KnowledgeGapsResponse {
  enabled: boolean;
  items: KnowledgeGapItem[];
}

export interface KnowledgeGapItem {
  id: string;
  clusterId: string;
  title: string;
  versionId: VersionId;
  categoryL2: string;
  reason: string;
  questionCount: number;
  lastSeenAt: IsoTimestamp;
}

export interface EfficiencyOpportunitiesResponse {
  enabled: boolean;
  items: EfficiencyOpportunityItem[];
}

export interface EfficiencyOpportunityItem {
  type: string;
  title: string;
  description: string;
  relatedClusterIds: string[];
  questionCount: number;
  priorityHint: string;
}

export interface ImprovementSuggestionsResponse {
  enabled: boolean;
  items: PublicImprovementSuggestion[];
}

export interface PublicImprovementSuggestion {
  id: string;
  reportId?: string | null;
  type: string;
  title: string;
  description: string;
  priority: string;
  priorityScore: number;
  status: string;
  statusNote?: string | null;
  relatedClusterIds: string[];
  evidence: JsonRecord;
  createdAt?: IsoTimestamp;
  updatedAt?: IsoTimestamp;
}

export interface ReportGenerateRequest {
  type?: string;
  versionId?: VersionId | "all";
  rangeDays?: number;
  llmEnhanced?: boolean;
}

export interface ReportGenerateResponse {
  jobId: string;
  job: PublicReportJob;
}

export interface ReportJobsResponse {
  enabled: boolean;
  items: PublicReportJob[];
}

export interface ReportsResponse {
  enabled: boolean;
  items: PublicReportSummary[];
}

export interface ReportDetailResponse extends PublicReportDetail {
  reportId: string;
  markdown: string;
}

export interface PublicReportSummary {
  reportId: string;
  type: string;
  title: string;
  versionId: VersionId | "all";
  rangeStart: IsoTimestamp;
  rangeEnd: IsoTimestamp;
  status: string;
  llmEnhanced: boolean;
  llmStatus: string;
  generatedAt: IsoTimestamp;
  metrics: JsonRecord;
}

export interface PublicReportDetail extends PublicReportSummary {
  reportJson: JsonRecord;
  markdown: string;
}

export interface PublicReportJob {
  id: string;
  type: string;
  status: string;
  payload: JsonRecord;
  result: JsonRecord;
  errorMessage?: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface PublicFaqCandidate {
  id: string;
  reportId?: string | null;
  clusterId?: string | null;
  question: string;
  answerSummary: string;
  evidence: JsonRecord;
  status: string;
  createdAt?: IsoTimestamp;
  updatedAt?: IsoTimestamp;
}

export interface PublicSkillCandidate {
  id: string;
  reportId?: string | null;
  title: string;
  triggerScenario: string;
  inputSummary: string;
  outputSummary: string;
  evidence: JsonRecord;
  status: string;
  createdAt?: IsoTimestamp;
  updatedAt?: IsoTimestamp;
}

export interface InsightRange {
  label: string;
  startAt: IsoTimestamp;
  endAt: IsoTimestamp;
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
