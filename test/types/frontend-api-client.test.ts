import type {
  AskRequest,
  AskStreamEvent,
  PublicConfigResponse,
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
  question: "如何查看订单状态？"
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

function renderEvent(event: AskStreamEvent): string {
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

void configPromise;
void versionsPromise;
void askRequest;
void askRequestWithoutVersion;
void askRequestWithSecret;
void renderEvent;
