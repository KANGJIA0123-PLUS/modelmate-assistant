import fs from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG = {
  host: "127.0.0.1",
  port: 4878,
  claudePath: "claude",
  claudePathByPlatform: {
    darwin: "claude",
    linux: "claude",
    win32: "claude.cmd"
  },
  claudeBare: false,
  workingDirectory: ".",
  questionLogPath: "data/question-log.jsonl",
  sourceDirs: ["."],
  versions: [],
  defaultVersionId: "",
  retrievalMode: "claude-tools",
  model: "",
  maxTurns: 8,
  maxBudgetUsd: 0.2,
  timeoutMs: 600000,
  contextMaxChars: 8000,
  historyMaxMessages: 8,
  historyMaxChars: 6000,
  searchMaxMatches: 80,
  allowedTools: ["Read", "Glob", "Grep", "LS"],
  disallowedTools: ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash", "WebFetch", "WebSearch"],
  queue: {
    implementationStatus: "implemented",
    maxConcurrent: 1,
    maxQueueSize: 20,
    perOperatorPerMinute: 20,
    perIpPerMinute: 60,
    jobTimeoutMs: 600000,
    queueTimeoutMs: 120000
  },
  historyStore: {
    enabled: true,
    dbPath: "data/assistant.sqlite",
    jsonlPath: "data/question-log.jsonl",
    retentionDays: 180
  },
  database: {
    provider: "sqlite",
    supabase: {
      url: "",
      serviceRoleKey: "",
      schema: "public"
    }
  },
  telemetry: {
    enabled: false,
    implementationStatus: "reserved",
    serviceName: "modelmate-assistant",
    otlpEndpoint: "",
    exportProtocol: "http/protobuf",
    enableClaudeTelemetry: false,
    logPromptContent: false,
    logToolContent: false
  },
  skills: {
    enabled: true,
    implementationStatus: "candidate-only",
    faqDirectAnswerEnabled: false,
    minFaqHitCount: 3,
    cacheTtlMs: 3600000
  },
  insights: {
    enabled: true,
    llmEnhanced: true,
    reportDir: "data/insight-reports",
    defaultRangeDays: 7,
    topClusterLimit: 10,
    samplePerCluster: 3,
    maxPromptChars: 24000,
    analysisTimeoutMs: 600000,
    llmMaxBudgetUsd: 0.2,
    redactionEnabled: true,
    reportRetentionDays: 365,
    jobRetentionDays: 30
  },
  systemPrompt:
    "你是现网接口人的只读知识助手。内部现网、接口、配置、日志、代码、流程类问题要优先查证本地资料、Markdown 文档和代码仓。若本地没有命中，且问题属于通用知识、公开背景或概念解释，可以使用模型通用知识回答，并友好提示来源边界。若问题强时效、高风险或明确要求只基于本地资料，则不要凭空下结论，要提示补充资料或核验。不要修改、创建、删除任何文件。"
};

export function loadConfig() {
  const cwd = process.cwd();
  const explicitConfigPath = String(process.env.MODEL_MATE_CONFIG || "").trim();
  const configPath = explicitConfigPath ? path.resolve(cwd, explicitConfigPath) : path.join(cwd, "assistant.config.json");
  const examplePath = path.join(cwd, "assistant.config.example.json");
  const warnings = [];
  let baseDir = cwd;
  let rawConfig = {};
  let loadedPath = null;

  if (fs.existsSync(configPath)) {
    rawConfig = readJson(configPath);
    loadedPath = configPath;
    baseDir = path.dirname(configPath);
  } else if (fs.existsSync(examplePath)) {
    rawConfig = readJson(examplePath);
    loadedPath = examplePath;
    baseDir = path.dirname(examplePath);
    warnings.push("未找到 assistant.config.json，当前使用 assistant.config.example.json 的默认配置。");
  } else {
    warnings.push("未找到配置文件，当前只允许读取当前工作区。");
  }

  const merged = normalizeConfig(mergeConfig(mergeConfig(DEFAULT_CONFIG, rawConfig), readEnvConfig()), baseDir, warnings);

  return {
    ...merged,
    loadedPath,
    warnings
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`配置文件解析失败：${filePath}\n${error.message}`);
  }
}

function normalizeConfig(config, baseDir, warnings) {
  const workingDirectory = resolveDir(config.workingDirectory || ".", baseDir);
  const historyStore = normalizeHistoryStore(config.historyStore || {}, config.questionLogPath, baseDir);
  const questionLogPath = historyStore.jsonlPath;
  const sourceDirs = normalizeArray(config.sourceDirs).map((dir) => resolveDir(dir, baseDir));
  const claudePathByPlatform = {
    ...DEFAULT_CONFIG.claudePathByPlatform,
    ...(config.claudePathByPlatform || {})
  };
  const effectiveClaudePath = resolveClaudePath(config.claudePath, claudePathByPlatform);
  const port = Number(config.port || DEFAULT_CONFIG.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`端口配置无效：${config.port}`);
  }

  const normalized = {
    ...config,
    host: String(config.host || DEFAULT_CONFIG.host),
    port,
    claudePath: String(config.claudePath || DEFAULT_CONFIG.claudePath),
    claudePathByPlatform,
    claudeBare: Boolean(config.claudeBare),
    effectiveClaudePath,
    workingDirectory,
    questionLogPath,
    historyStore,
    sourceDirs,
    retrievalMode: normalizeRetrievalMode(config.retrievalMode, warnings),
    maxTurns: normalizeNumber(config.maxTurns, DEFAULT_CONFIG.maxTurns, 1, 20),
    maxBudgetUsd: normalizeNumber(config.maxBudgetUsd, DEFAULT_CONFIG.maxBudgetUsd, 0, 100),
    timeoutMs: normalizeNumber(config.timeoutMs, DEFAULT_CONFIG.timeoutMs, 1000, 60 * 60 * 1000),
    contextMaxChars: normalizeNumber(config.contextMaxChars, DEFAULT_CONFIG.contextMaxChars, 0, 200000),
    historyMaxMessages: normalizeNumber(config.historyMaxMessages, DEFAULT_CONFIG.historyMaxMessages, 0, 50),
    historyMaxChars: normalizeNumber(config.historyMaxChars, DEFAULT_CONFIG.historyMaxChars, 0, 100000),
    searchMaxMatches: normalizeNumber(config.searchMaxMatches, DEFAULT_CONFIG.searchMaxMatches, 0, 1000),
    allowedTools: normalizeArray(config.allowedTools),
    disallowedTools: normalizeArray(config.disallowedTools),
    queue: normalizeQueue(config.queue || {}),
    telemetry: normalizeTelemetry(config.telemetry || {}, warnings),
    skills: normalizeSkills(config.skills || {}, warnings),
    database: normalizeDatabase(config.database || {}),
    insights: normalizeInsights(config.insights || {}, baseDir)
  };
  const versions = normalizeVersions(normalized, baseDir, warnings);
  const defaultVersionId = selectDefaultVersionId(config.defaultVersionId, versions);

  return {
    ...normalized,
    versions,
    defaultVersionId,
    sourceDirs: []
  };
}

function mergeConfig(defaults, rawConfig) {
  return {
    ...defaults,
    ...rawConfig,
    claudePathByPlatform: {
      ...defaults.claudePathByPlatform,
      ...(rawConfig.claudePathByPlatform || {})
    },
    claudeBare: rawConfig.claudeBare ?? defaults.claudeBare,
    queue: {
      ...defaults.queue,
      ...(rawConfig.queue || {})
    },
    historyStore: {
      ...defaults.historyStore,
      ...(rawConfig.historyStore || {})
    },
    database: {
      ...defaults.database,
      ...(rawConfig.database || {}),
      supabase: {
        ...defaults.database?.supabase,
        ...(rawConfig.database?.supabase || {})
      }
    },
    telemetry: {
      ...defaults.telemetry,
      ...(rawConfig.telemetry || {})
    },
    skills: {
      ...defaults.skills,
      ...(rawConfig.skills || {})
    },
    insights: {
      ...defaults.insights,
      ...(rawConfig.insights || {})
    }
  };
}

function readEnvConfig() {
  const env = process.env;
  const overrides = {};
  const dataDir = String(env.MODEL_MATE_DATA_DIR || "").trim();

  assignString(overrides, "host", env.MODEL_MATE_HOST);
  assignNumber(overrides, "port", env.MODEL_MATE_PORT);
  assignString(overrides, "claudePath", env.MODEL_MATE_CLAUDE_PATH);
  assignBoolean(overrides, "claudeBare", env.MODEL_MATE_CLAUDE_BARE);
  assignString(overrides, "workingDirectory", env.MODEL_MATE_WORKING_DIR);
  assignString(overrides, "retrievalMode", env.MODEL_MATE_RETRIEVAL_MODE);
  assignString(overrides, "model", env.MODEL_MATE_MODEL);
  assignNumber(overrides, "timeoutMs", env.MODEL_MATE_TIMEOUT_MS);

  if (dataDir) {
    overrides.questionLogPath = path.join(dataDir, "question-log.jsonl");
    overrides.historyStore = {
      ...(overrides.historyStore || {}),
      dbPath: path.join(dataDir, "assistant.sqlite"),
      jsonlPath: path.join(dataDir, "question-log.jsonl")
    };
    overrides.insights = {
      ...(overrides.insights || {}),
      reportDir: path.join(dataDir, "insight-reports")
    };
  }

  assignString(overrides, "questionLogPath", env.MODEL_MATE_QUESTION_LOG_PATH);
  assignNestedString(overrides, "historyStore", "dbPath", env.MODEL_MATE_SQLITE_PATH);
  assignNestedString(overrides, "historyStore", "jsonlPath", env.MODEL_MATE_HISTORY_JSONL_PATH);
  assignNestedBoolean(overrides, "historyStore", "enabled", env.MODEL_MATE_HISTORY_ENABLED);
  assignNestedString(overrides, "database", "provider", env.MODEL_MATE_DATABASE_PROVIDER);
  assignDoubleNestedString(overrides, "database", "supabase", "url", env.SUPABASE_URL);
  assignDoubleNestedString(overrides, "database", "supabase", "serviceRoleKey", env.SUPABASE_SERVICE_ROLE_KEY);
  assignDoubleNestedString(overrides, "database", "supabase", "schema", env.MODEL_MATE_SUPABASE_SCHEMA);
  assignNestedBoolean(overrides, "insights", "enabled", env.MODEL_MATE_INSIGHTS_ENABLED);
  assignNestedBoolean(overrides, "insights", "llmEnhanced", env.MODEL_MATE_INSIGHTS_LLM_ENABLED);
  assignNestedString(overrides, "insights", "reportDir", env.MODEL_MATE_REPORT_DIR);

  return overrides;
}

function assignString(target, key, value) {
  const normalized = String(value || "").trim();

  if (normalized) {
    target[key] = normalized;
  }
}

function assignNumber(target, key, value) {
  const normalized = String(value || "").trim();

  if (normalized) {
    target[key] = Number(normalized);
  }
}

function assignBoolean(target, key, value) {
  const parsed = parseEnvBoolean(value);

  if (parsed !== null) {
    target[key] = parsed;
  }
}

function assignNestedString(target, section, key, value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return;
  }

  target[section] = {
    ...(target[section] || {}),
    [key]: normalized
  };
}

function assignNestedBoolean(target, section, key, value) {
  const parsed = parseEnvBoolean(value);

  if (parsed === null) {
    return;
  }

  target[section] = {
    ...(target[section] || {}),
    [key]: parsed
  };
}

function assignDoubleNestedString(target, section, nestedSection, key, value) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return;
  }

  target[section] = {
    ...(target[section] || {}),
    [nestedSection]: {
      ...(target[section]?.[nestedSection] || {}),
      [key]: normalized
    }
  };
}

function parseEnvBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function normalizeDatabase(database) {
  const provider = String(database.provider || DEFAULT_CONFIG.database.provider).trim() || DEFAULT_CONFIG.database.provider;

  if (!["sqlite", "supabase"].includes(provider)) {
    throw new Error(`database.provider 仅支持 sqlite 或 supabase：${provider}`);
  }

  const supabase = database.supabase || {};

  return {
    provider,
    supabase: {
      url: String(supabase.url || "").trim(),
      serviceRoleKey: String(supabase.serviceRoleKey || "").trim(),
      schema: String(supabase.schema || DEFAULT_CONFIG.database.supabase.schema).trim() || DEFAULT_CONFIG.database.supabase.schema
    }
  };
}

function normalizeVersions(config, baseDir, warnings) {
  const rawVersions = Array.isArray(config.versions) && config.versions.length > 0
    ? config.versions
    : [buildLegacyDefaultVersion(config)];
  const seenIds = new Set();
  const versions = [];

  for (const rawVersion of rawVersions) {
    const version = normalizeVersion(rawVersion, config, baseDir, warnings);

    if (seenIds.has(version.id)) {
      throw new Error(`版本 id 重复：${version.id}`);
    }

    seenIds.add(version.id);
    versions.push(version);
  }

  if (versions.length === 0) {
    throw new Error("至少需要配置一个版本。");
  }

  validateVersionSourceIsolation(versions);
  return versions;
}

function buildLegacyDefaultVersion(config) {
  return {
    id: "default",
    name: "默认版本",
    description: "由旧版 sourceDirs 自动生成的默认版本。",
    status: "active",
    tags: ["legacy"],
    workingDirectory: config.workingDirectory,
    sourceDirs: config.sourceDirs
  };
}

function normalizeVersion(rawVersion, config, baseDir, warnings) {
  const id = String(rawVersion?.id || "").trim();

  if (!id) {
    throw new Error("版本 id 不能为空。");
  }

  const rawSourceDirs = normalizeArray(rawVersion.sourceDirs);
  const rawWorkingDirectory = rawVersion.workingDirectory || (rawSourceDirs.length > 0 ? rawSourceDirs[0] : config.workingDirectory || ".");
  const workingDirectoryCandidate = resolveDir(rawWorkingDirectory, baseDir);
  const configuredSourceDirs = rawSourceDirs.length > 0
    ? rawSourceDirs.map((dir) => resolveDir(dir, baseDir))
    : [workingDirectoryCandidate];
  const sourceDirs = filterReadableDirs(configuredSourceDirs, warnings, `版本 ${id}`);

  if (sourceDirs.length === 0) {
    throw new Error(`版本 ${id} 至少需要一个可读取的 sourceDirs，不能退回全局知识源。`);
  }

  const realWorkingDirectory = realpathDir(workingDirectoryCandidate);
  let workingDirectory = realWorkingDirectory;

  if (!workingDirectory) {
    workingDirectory = sourceDirs[0];
    warnings.push(`版本 ${id} 的工作目录不存在或不可读取，已使用该版本第一个 sourceDirs 作为工作目录。`);
  } else if (!isInsideAnyDir(workingDirectory, sourceDirs)) {
    workingDirectory = sourceDirs[0];
    warnings.push(`版本 ${id} 的工作目录不在该版本 sourceDirs 内，已使用该版本第一个 sourceDirs 作为工作目录以保持物理隔离。`);
  }

  return {
    id,
    name: String(rawVersion.name || id).trim() || id,
    description: String(rawVersion.description || "").trim(),
    status: String(rawVersion.status || "active").trim() || "active",
    tags: normalizeArray(rawVersion.tags),
    workingDirectory,
    sourceDirs: unique(sourceDirs)
  };
}

function validateVersionSourceIsolation(versions) {
  for (let leftIndex = 0; leftIndex < versions.length; leftIndex += 1) {
    const left = versions[leftIndex];

    for (let rightIndex = leftIndex + 1; rightIndex < versions.length; rightIndex += 1) {
      const right = versions[rightIndex];

      for (const leftDir of left.sourceDirs) {
        for (const rightDir of right.sourceDirs) {
          if (isSameOrInside(leftDir, rightDir) || isSameOrInside(rightDir, leftDir)) {
            throw new Error(`版本 ${left.id} 与版本 ${right.id} 的 sourceDirs 存在物理重叠：${leftDir} <-> ${rightDir}`);
          }
        }
      }
    }
  }
}

function selectDefaultVersionId(value, versions) {
  const requested = String(value || "").trim();

  if (requested && versions.some((version) => version.id === requested)) {
    return requested;
  }

  const active = versions.find((version) => version.status === "active");
  return active?.id || versions[0]?.id || "";
}

function filterReadableDirs(dirs, warnings, label) {
  const existingDirs = [];

  for (const dir of unique(dirs)) {
    const realDir = realpathDir(dir);

    if (realDir) {
      existingDirs.push(realDir);
    } else {
      warnings.push(`${label} 知识源目录不存在或不可读取：${dir}`);
    }
  }

  return existingDirs;
}

function realpathDir(dir) {
  try {
    const realDir = fs.realpathSync(dir);
    return fs.statSync(realDir).isDirectory() ? realDir : "";
  } catch {
    return "";
  }
}

function isInsideAnyDir(childPath, parentDirs) {
  return parentDirs.some((parentDir) => isSameOrInside(childPath, parentDir));
}

function isSameOrInside(childPath, parentDir) {
  const relative = path.relative(parentDir, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveClaudePath(claudePath, claudePathByPlatform) {
  const explicitClaudePath = String(claudePath || "").trim();

  if (explicitClaudePath && explicitClaudePath !== DEFAULT_CONFIG.claudePath) {
    return explicitClaudePath;
  }

  return String(claudePathByPlatform[process.platform] || explicitClaudePath || DEFAULT_CONFIG.claudePath);
}

function normalizeRetrievalMode(value, warnings) {
  const mode = String(value || DEFAULT_CONFIG.retrievalMode).trim();

  if (mode === "claude-tools" || mode === "local-context") {
    return mode;
  }

  warnings.push(`未知 retrievalMode：${mode}，已使用 claude-tools。`);
  return DEFAULT_CONFIG.retrievalMode;
}

function normalizeHistoryStore(value, legacyQuestionLogPath, baseDir) {
  const jsonlPath = value.jsonlPath || legacyQuestionLogPath || DEFAULT_CONFIG.historyStore.jsonlPath;

  return {
    enabled: Boolean(value.enabled),
    dbPath: path.resolve(baseDir, value.dbPath || DEFAULT_CONFIG.historyStore.dbPath),
    jsonlPath: path.resolve(baseDir, jsonlPath),
    retentionDays: normalizeNumber(value.retentionDays, DEFAULT_CONFIG.historyStore.retentionDays, 1, 3650)
  };
}

function normalizeQueue(value) {
  return {
    implementationStatus: "implemented",
    maxConcurrent: normalizeNumber(value.maxConcurrent, DEFAULT_CONFIG.queue.maxConcurrent, 1, 50),
    maxQueueSize: normalizeNumber(value.maxQueueSize, DEFAULT_CONFIG.queue.maxQueueSize, 0, 10000),
    perOperatorPerMinute: normalizeNumber(value.perOperatorPerMinute, DEFAULT_CONFIG.queue.perOperatorPerMinute, 0, 10000),
    perIpPerMinute: normalizeNumber(value.perIpPerMinute, DEFAULT_CONFIG.queue.perIpPerMinute, 0, 10000),
    jobTimeoutMs: normalizeNumber(value.jobTimeoutMs, DEFAULT_CONFIG.queue.jobTimeoutMs, 1000, 60 * 60 * 1000),
    queueTimeoutMs: normalizeNumber(value.queueTimeoutMs, DEFAULT_CONFIG.queue.queueTimeoutMs, 1000, 60 * 60 * 1000)
  };
}

function normalizeTelemetry(value, warnings) {
  const requestedEnabled = Boolean(value.enabled);
  const requestedClaudeTelemetry = Boolean(value.enableClaudeTelemetry);

  if (requestedEnabled || requestedClaudeTelemetry) {
    warnings.push("telemetry 当前为预留配置：不会启动 OpenTelemetry SDK、OTLP exporter 或 Claude telemetry 环境变量。");
  }

  return {
    enabled: false,
    requestedEnabled,
    implementationStatus: "reserved",
    serviceName: String(value.serviceName || DEFAULT_CONFIG.telemetry.serviceName),
    otlpEndpoint: String(value.otlpEndpoint || ""),
    exportProtocol: String(value.exportProtocol || DEFAULT_CONFIG.telemetry.exportProtocol),
    enableClaudeTelemetry: false,
    requestedClaudeTelemetry,
    logPromptContent: false,
    logToolContent: false
  };
}

function normalizeSkills(value, warnings) {
  const requestedFaqDirectAnswer = Boolean(value.faqDirectAnswerEnabled);

  if (requestedFaqDirectAnswer) {
    warnings.push("skills.faqDirectAnswerEnabled 当前为预留配置：不会绕过 Claude Code 主链路做 FAQ 直达。");
  }

  return {
    enabled: value.enabled !== false,
    implementationStatus: "candidate-only",
    candidateGenerationEnabled: value.enabled !== false,
    faqDirectAnswerEnabled: false,
    requestedFaqDirectAnswerEnabled: requestedFaqDirectAnswer,
    minFaqHitCount: normalizeNumber(value.minFaqHitCount, DEFAULT_CONFIG.skills.minFaqHitCount, 1, 1000),
    cacheTtlMs: normalizeNumber(value.cacheTtlMs, DEFAULT_CONFIG.skills.cacheTtlMs, 0, 30 * 24 * 60 * 60 * 1000)
  };
}

function normalizeInsights(value, baseDir) {
  return {
    enabled: value.enabled !== false,
    llmEnhanced: Boolean(value.llmEnhanced),
    reportDir: path.resolve(baseDir, value.reportDir || DEFAULT_CONFIG.insights.reportDir),
    defaultRangeDays: normalizeNumber(value.defaultRangeDays, DEFAULT_CONFIG.insights.defaultRangeDays, 1, 366),
    topClusterLimit: normalizeNumber(value.topClusterLimit, DEFAULT_CONFIG.insights.topClusterLimit, 1, 100),
    samplePerCluster: normalizeNumber(value.samplePerCluster, DEFAULT_CONFIG.insights.samplePerCluster, 0, 20),
    maxPromptChars: normalizeNumber(value.maxPromptChars, DEFAULT_CONFIG.insights.maxPromptChars, 1000, 200000),
    analysisTimeoutMs: normalizeNumber(value.analysisTimeoutMs, DEFAULT_CONFIG.insights.analysisTimeoutMs, 1000, 60 * 60 * 1000),
    llmMaxBudgetUsd: normalizeNumber(value.llmMaxBudgetUsd, DEFAULT_CONFIG.insights.llmMaxBudgetUsd, 0, 100),
    redactionEnabled: value.redactionEnabled !== false,
    reportRetentionDays: normalizeNumber(value.reportRetentionDays, DEFAULT_CONFIG.insights.reportRetentionDays, 1, 3650),
    jobRetentionDays: normalizeNumber(value.jobRetentionDays, DEFAULT_CONFIG.insights.jobRetentionDays, 1, 3650)
  };
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, number));
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function resolveDir(dir, baseDir) {
  if (!dir) {
    return baseDir;
  }

  return path.resolve(baseDir, dir);
}

function unique(items) {
  return [...new Set(items)];
}
