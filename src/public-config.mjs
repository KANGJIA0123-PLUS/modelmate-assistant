export function buildPublicConfig({ config, versionRegistry, askQueue, historyStore }) {
  return {
    host: config.host,
    port: config.port,
    model: config.model,
    displayModel: config.model || "Claude Code 默认",
    claudeBare: Boolean(config.claudeBare),
    maxTurns: config.maxTurns,
    timeoutMs: config.timeoutMs,
    retrievalMode: config.retrievalMode,
    contextMaxChars: config.contextMaxChars,
    historyMaxMessages: config.historyMaxMessages,
    historyMaxChars: config.historyMaxChars,
    defaultVersionId: versionRegistry.getPublicDefaultVersionId(),
    queue: {
      ...config.queue,
      stats: askQueue.getStats()
    },
    telemetry: publicTelemetryConfig(config),
    skills: publicSkillsConfig(config),
    capabilities: publicCapabilities(config, askQueue),
    historyStore: {
      enabled: Boolean(historyStore.enabled),
      retentionDays: config.historyStore.retentionDays
    },
    database: publicDatabaseConfig(config),
    insights: publicInsightsConfig(config),
    warnings: config.warnings,
    allowedTools: config.allowedTools,
    disallowedTools: config.disallowedTools
  };
}

function publicTelemetryConfig(config) {
  const telemetry = config.telemetry || {};

  return {
    enabled: Boolean(telemetry.enabled),
    requestedEnabled: Boolean(telemetry.requestedEnabled),
    implementationStatus: telemetry.implementationStatus || "reserved",
    serviceName: telemetry.serviceName,
    exportProtocol: telemetry.exportProtocol,
    enableClaudeTelemetry: Boolean(telemetry.enableClaudeTelemetry),
    requestedClaudeTelemetry: Boolean(telemetry.requestedClaudeTelemetry)
  };
}

function publicSkillsConfig(config) {
  const skills = config.skills || {};

  return {
    enabled: Boolean(skills.enabled),
    implementationStatus: skills.implementationStatus || "candidate-only",
    candidateGenerationEnabled: Boolean(skills.candidateGenerationEnabled),
    faqDirectAnswerEnabled: Boolean(skills.faqDirectAnswerEnabled),
    requestedFaqDirectAnswerEnabled: Boolean(skills.requestedFaqDirectAnswerEnabled),
    minFaqHitCount: skills.minFaqHitCount,
    cacheTtlMs: skills.cacheTtlMs
  };
}

function publicCapabilities(config, askQueue) {
  const queueStats = askQueue.getStats();

  return {
    queue: {
      key: "queue",
      name: "Queue",
      status: "implemented",
      statusLabel: "已实现",
      summary: `问答请求已接入队列、并发、排队超时、任务超时，以及按账号/IP限流。当前运行 ${queueStats.activeCount} 个，排队 ${queueStats.queuedCount} 个。`
    },
    telemetry: {
      key: "telemetry",
      name: "Telemetry",
      status: "reserved",
      statusLabel: "预留",
      summary: config.telemetry?.requestedEnabled
        ? "配置请求启用 telemetry，但当前版本尚未启动 OpenTelemetry SDK 或 OTLP exporter。"
        : "仅保留配置字段和洞察内部安全计数；当前版本尚未启动 OpenTelemetry SDK 或 OTLP exporter。",
      requestedEnabled: Boolean(config.telemetry?.requestedEnabled)
    },
    skills: {
      key: "skills",
      name: "Skills",
      status: "candidate-only",
      statusLabel: "候选沉淀",
      summary: "数据洞察会沉淀 FAQ/Skill 候选；运行时自动 Skill 编排和 FAQ 直达仍是预留能力。",
      candidateGenerationEnabled: Boolean(config.skills?.candidateGenerationEnabled),
      faqDirectAnswerEnabled: Boolean(config.skills?.faqDirectAnswerEnabled)
    }
  };
}

function publicDatabaseConfig(config) {
  const database = config.database || {};
  const supabase = database.supabase || {};

  return {
    provider: database.provider || "sqlite",
    supabase: {
      url: supabase.url || "",
      schema: supabase.schema || "public"
    }
  };
}

function publicInsightsConfig(config) {
  const insights = config.insights || {};

  return {
    enabled: Boolean(insights.enabled),
    llmEnhanced: Boolean(insights.llmEnhanced),
    defaultRangeDays: insights.defaultRangeDays,
    topClusterLimit: insights.topClusterLimit,
    samplePerCluster: insights.samplePerCluster,
    maxPromptChars: insights.maxPromptChars,
    analysisTimeoutMs: insights.analysisTimeoutMs,
    redactionEnabled: Boolean(insights.redactionEnabled),
    reportRetentionDays: insights.reportRetentionDays,
    jobRetentionDays: insights.jobRetentionDays
  };
}
