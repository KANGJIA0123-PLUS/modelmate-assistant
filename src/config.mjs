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
  workingDirectory: ".",
  questionLogPath: "data/question-log.jsonl",
  sourceDirs: ["."],
  versions: [],
  defaultVersionId: "",
  retrievalMode: "claude-tools",
  model: "",
  maxTurns: 1,
  maxBudgetUsd: 0.2,
  timeoutMs: 600000,
  contextMaxChars: 8000,
  historyMaxMessages: 8,
  historyMaxChars: 6000,
  searchMaxMatches: 80,
  allowedTools: ["Read", "Glob", "Grep", "LS"],
  disallowedTools: ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash", "WebFetch", "WebSearch"],
  queue: {
    maxConcurrent: 1,
    maxQueueSize: 20,
    perOperatorPerMinute: 20,
    perIpPerMinute: 60,
    jobTimeoutMs: 600000,
    queueTimeoutMs: 120000
  },
  historyStore: {
    enabled: false,
    dbPath: "data/assistant.sqlite",
    jsonlPath: "data/question-log.jsonl",
    retentionDays: 180
  },
  telemetry: {
    enabled: false,
    serviceName: "modelmate-assistant",
    otlpEndpoint: "",
    exportProtocol: "http/protobuf",
    enableClaudeTelemetry: false,
    logPromptContent: false,
    logToolContent: false
  },
  skills: {
    enabled: true,
    faqDirectAnswerEnabled: false,
    minFaqHitCount: 3,
    cacheTtlMs: 3600000
  },
  systemPrompt:
    "你是现网接口人的只读知识助手。内部现网、接口、配置、日志、代码、流程类问题要优先查证本地资料、Markdown 文档和代码仓。若本地没有命中，且问题属于通用知识、公开背景或概念解释，可以使用模型通用知识回答，并友好提示来源边界。若问题强时效、高风险或明确要求只基于本地资料，则不要凭空下结论，要提示补充资料或核验。不要修改、创建、删除任何文件。"
};

export function loadConfig() {
  const cwd = process.cwd();
  const configPath = path.join(cwd, "assistant.config.json");
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

  const merged = normalizeConfig(mergeConfig(DEFAULT_CONFIG, rawConfig), baseDir, warnings);

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
    telemetry: normalizeTelemetry(config.telemetry || {}),
    skills: normalizeSkills(config.skills || {})
  };
  const versions = normalizeVersions(normalized, baseDir, warnings);
  const defaultVersionId = selectDefaultVersionId(config.defaultVersionId, versions);
  const defaultVersion = versions.find((version) => version.id === defaultVersionId) || versions[0];

  return {
    ...normalized,
    versions,
    defaultVersionId,
    sourceDirs: defaultVersion?.sourceDirs || []
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
    queue: {
      ...defaults.queue,
      ...(rawConfig.queue || {})
    },
    historyStore: {
      ...defaults.historyStore,
      ...(rawConfig.historyStore || {})
    },
    telemetry: {
      ...defaults.telemetry,
      ...(rawConfig.telemetry || {})
    },
    skills: {
      ...defaults.skills,
      ...(rawConfig.skills || {})
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

  const workingDirectory = resolveDir(rawVersion.workingDirectory || config.workingDirectory || ".", baseDir);
  const rawSourceDirs = normalizeArray(rawVersion.sourceDirs);
  const configuredSourceDirs = rawSourceDirs.length > 0
    ? rawSourceDirs.map((dir) => resolveDir(dir, baseDir))
    : [workingDirectory];
  const existingWorkingDirectory = ensureReadableDir(workingDirectory)
    ? workingDirectory
    : config.workingDirectory;
  const sourceDirs = filterReadableDirs(configuredSourceDirs, warnings, `版本 ${id}`);
  const fallbackDirs = sourceDirs.length > 0
    ? sourceDirs
    : filterReadableDirs([existingWorkingDirectory], warnings, `版本 ${id} fallback`);

  if (!ensureReadableDir(workingDirectory)) {
    warnings.push(`版本 ${id} 的工作目录不存在或不可读取，已使用全局工作目录。`);
  }

  if (fallbackDirs.length === 0) {
    fallbackDirs.push(config.workingDirectory);
    warnings.push(`版本 ${id} 没有可用知识源目录，已临时退回全局工作目录。`);
  }

  return {
    id,
    name: String(rawVersion.name || id).trim() || id,
    description: String(rawVersion.description || "").trim(),
    status: String(rawVersion.status || "active").trim() || "active",
    tags: normalizeArray(rawVersion.tags),
    workingDirectory: existingWorkingDirectory,
    sourceDirs: unique(fallbackDirs)
  };
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
    if (ensureReadableDir(dir)) {
      existingDirs.push(dir);
    } else {
      warnings.push(`${label} 知识源目录不存在或不可读取：${dir}`);
    }
  }

  return existingDirs;
}

function ensureReadableDir(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
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
    maxConcurrent: normalizeNumber(value.maxConcurrent, DEFAULT_CONFIG.queue.maxConcurrent, 1, 50),
    maxQueueSize: normalizeNumber(value.maxQueueSize, DEFAULT_CONFIG.queue.maxQueueSize, 0, 10000),
    perOperatorPerMinute: normalizeNumber(value.perOperatorPerMinute, DEFAULT_CONFIG.queue.perOperatorPerMinute, 0, 10000),
    perIpPerMinute: normalizeNumber(value.perIpPerMinute, DEFAULT_CONFIG.queue.perIpPerMinute, 0, 10000),
    jobTimeoutMs: normalizeNumber(value.jobTimeoutMs, DEFAULT_CONFIG.queue.jobTimeoutMs, 1000, 60 * 60 * 1000),
    queueTimeoutMs: normalizeNumber(value.queueTimeoutMs, DEFAULT_CONFIG.queue.queueTimeoutMs, 1000, 60 * 60 * 1000)
  };
}

function normalizeTelemetry(value) {
  return {
    enabled: Boolean(value.enabled),
    serviceName: String(value.serviceName || DEFAULT_CONFIG.telemetry.serviceName),
    otlpEndpoint: String(value.otlpEndpoint || ""),
    exportProtocol: String(value.exportProtocol || DEFAULT_CONFIG.telemetry.exportProtocol),
    enableClaudeTelemetry: Boolean(value.enableClaudeTelemetry),
    logPromptContent: Boolean(value.logPromptContent),
    logToolContent: Boolean(value.logToolContent)
  };
}

function normalizeSkills(value) {
  return {
    enabled: value.enabled !== false,
    faqDirectAnswerEnabled: Boolean(value.faqDirectAnswerEnabled),
    minFaqHitCount: normalizeNumber(value.minFaqHitCount, DEFAULT_CONFIG.skills.minFaqHitCount, 1, 1000),
    cacheTtlMs: normalizeNumber(value.cacheTtlMs, DEFAULT_CONFIG.skills.cacheTtlMs, 0, 30 * 24 * 60 * 60 * 1000)
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
