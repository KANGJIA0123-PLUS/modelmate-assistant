import type {
  AskRequest,
  AskStreamEvent,
  InsightOverviewResponse,
  PublicReportDetail,
  PublicReportJob,
  PublicReportSummary,
  PublicConfigResponse,
  ReportDetailResponse,
  ReportGenerateResponse,
  VersionsResponse
} from "../../src/types/index.js";

type FrontendApiClient = {
  fetchRuntimeConfig: () => Promise<PublicConfigResponse>;
  fetchVersions: () => Promise<VersionsResponse>;
};

const apiClient: FrontendApiClient = {
  async fetchRuntimeConfig() {
    return {
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
        stats: {
          activeCount: 0,
          queuedCount: 0
        }
      },
      telemetry: {
        enabled: false,
        requestedEnabled: false,
        implementationStatus: "reserved",
        enableClaudeTelemetry: false,
        requestedClaudeTelemetry: false
      },
      skills: {
        enabled: true,
        implementationStatus: "candidate-only",
        candidateGenerationEnabled: true,
        faqDirectAnswerEnabled: false,
        requestedFaqDirectAnswerEnabled: false
      },
      capabilities: {},
      historyStore: {
        enabled: true,
        retentionDays: 180
      },
      database: {
        provider: "sqlite",
        supabase: {
          url: "",
          schema: "public"
        }
      },
      insights: {
        enabled: true,
        llmEnhanced: false,
        redactionEnabled: true
      },
      warnings: [],
      allowedTools: ["Read", "Glob", "Grep", "LS"],
      disallowedTools: ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash", "WebFetch", "WebSearch"]
    };
  },
  async fetchVersions() {
    return {
      defaultVersionId: "default",
      versions: []
    };
  }
};

const configPromise: Promise<PublicConfigResponse> = apiClient.fetchRuntimeConfig();
const versionsPromise: Promise<VersionsResponse> = apiClient.fetchVersions();

const askRequest: AskRequest = {
  versionId: "default",
  question: "如何查看订单状态？",
  operator: "ops-user"
};

// @ts-expect-error AskRequest requires versionId.
const askRequestWithoutVersion: AskRequest = {
  question: "如何查看订单状态？"
};

const askRequestWithSecret: AskRequest = {
  versionId: "default",
  question: "如何查看订单状态？",
  // @ts-expect-error AskRequest must not carry serviceRoleKey to the frontend API.
  serviceRoleKey: "service-role-secret"
};

const publicReportJob: PublicReportJob = {
  id: "job-1",
  type: "report_generation",
  status: "queued",
  payload: {},
  result: {},
  errorMessage: null,
  createdAt: "2026-06-28T00:00:00.000Z",
  updatedAt: "2026-06-28T00:00:00.000Z"
};

const generatedReport: ReportGenerateResponse = {
  jobId: "job-1",
  job: publicReportJob
};

const generatedReportWithReport: ReportGenerateResponse = {
  jobId: "job-1",
  job: publicReportJob,
  // @ts-expect-error ReportGenerateResponse does not return an inline report.
  report: {}
};

const publicReportSummary: PublicReportSummary = {
  reportId: "report-1",
  type: "weekly",
  title: "周报",
  versionId: "default",
  rangeStart: "2026-06-01T00:00:00.000Z",
  rangeEnd: "2026-06-28T00:00:00.000Z",
  status: "completed",
  llmEnhanced: false,
  llmStatus: "disabled",
  generatedAt: "2026-06-28T00:00:00.000Z",
  metrics: {}
};

const publicReportSummaryWithSnakeId: PublicReportSummary = {
  ...publicReportSummary,
  // @ts-expect-error Public report summaries use reportId, not report_id.
  report_id: "report-1"
};

const publicReportSummaryWithSnakeTime: PublicReportSummary = {
  ...publicReportSummary,
  // @ts-expect-error Public report summaries use generatedAt, not generated_at.
  generated_at: "2026-06-28T00:00:00.000Z"
};

const publicReportSummaryWithSnakeMetrics: PublicReportSummary = {
  ...publicReportSummary,
  // @ts-expect-error Public report summaries use metrics, not metrics_json.
  metrics_json: {}
};

const publicReportDetail: PublicReportDetail = {
  ...publicReportSummary,
  reportJson: {},
  markdown: "# 周报"
};

const reportDetail: ReportDetailResponse = publicReportDetail;

const wrappedReportDetail: ReportDetailResponse = {
  // @ts-expect-error /api/reports/:id returns the report object directly.
  report: publicReportDetail
};

const overview: InsightOverviewResponse = {
  range: {
    label: "7d",
    startAt: "2026-06-21T00:00:00.000Z",
    endAt: "2026-06-28T00:00:00.000Z"
  },
  versionId: "all",
  metrics: {
    totalQuestions: 12,
    effectiveQuestions: 11,
    highFrequencyClusterCount: 3,
    knowledgeGapRate: 16.7,
    knowledgeHitRate: 75,
    repetitionRate: 40,
    avgElapsedMs: 1200,
    avgQueueWaitMs: 20,
    failureRate: 8.3,
    aiOpportunityCount: 4
  },
  counts: {
    failedQuestions: 1,
    knowledgeGapQuestions: 2,
    knowledgeHitQuestions: 9,
    repeatedQuestions: 5,
    platformSignals: 1,
    versionCount: 2
  }
};

const overviewWithTopLevelTotal: InsightOverviewResponse = {
  ...overview,
  // @ts-expect-error totalQuestions lives under metrics.
  totalQuestions: 12
};

function renderEvent(event: AskStreamEvent): string {
  switch (event.type) {
    case "start":
      return event.requestId || event.jobId || "";
    case "queue":
      return String(event.position);
    case "history":
      return String(event.enabled);
    case "status":
      return event.message;
    case "context":
      return String(event.sourceCount);
    case "meta":
      return event.versionId || "";
    case "delta":
      return event.text;
    case "done":
      return event.answer || event.payload?.answer || "";
    case "error":
      return event.message || event.error || "";
    default: {
      const neverEvent: never = event;
      return neverEvent;
    }
  }
}

void configPromise;
void versionsPromise;
void askRequest;
void askRequestWithoutVersion;
void askRequestWithSecret;
void generatedReport;
void generatedReportWithReport;
void publicReportSummaryWithSnakeId;
void publicReportSummaryWithSnakeTime;
void publicReportSummaryWithSnakeMetrics;
void reportDetail;
void wrappedReportDetail;
void overviewWithTopLevelTotal;
void renderEvent;
