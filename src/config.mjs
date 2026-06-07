import fs from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG = {
  host: "127.0.0.1",
  port: 4878,
  claudePath: "claude",
  workingDirectory: ".",
  questionLogPath: "data/question-log.jsonl",
  sourceDirs: ["."],
  retrievalMode: "local-context",
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

  const merged = normalizeConfig({ ...DEFAULT_CONFIG, ...rawConfig }, baseDir);
  const existingSourceDirs = [];

  for (const sourceDir of merged.sourceDirs) {
    if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory()) {
      existingSourceDirs.push(sourceDir);
    } else {
      warnings.push(`知识源目录不存在或不可读取：${sourceDir}`);
    }
  }

  if (existingSourceDirs.length === 0) {
    existingSourceDirs.push(merged.workingDirectory);
    warnings.push("没有可用知识源目录，已临时退回当前工作目录。");
  }

  return {
    ...merged,
    loadedPath,
    warnings,
    sourceDirs: unique(existingSourceDirs)
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`配置文件解析失败：${filePath}\n${error.message}`);
  }
}

function normalizeConfig(config, baseDir) {
  const workingDirectory = resolveDir(config.workingDirectory || ".", baseDir);
  const questionLogPath = path.resolve(baseDir, config.questionLogPath || DEFAULT_CONFIG.questionLogPath);
  const sourceDirs = normalizeArray(config.sourceDirs).map((dir) => resolveDir(dir, baseDir));

  return {
    ...config,
    host: String(config.host || DEFAULT_CONFIG.host),
    port: Number(config.port || DEFAULT_CONFIG.port),
    workingDirectory,
    questionLogPath,
    sourceDirs,
    retrievalMode: String(config.retrievalMode || DEFAULT_CONFIG.retrievalMode),
    maxTurns: Number(config.maxTurns || DEFAULT_CONFIG.maxTurns),
    maxBudgetUsd: Number(config.maxBudgetUsd || DEFAULT_CONFIG.maxBudgetUsd),
    timeoutMs: Number(config.timeoutMs || DEFAULT_CONFIG.timeoutMs),
    contextMaxChars: Number(config.contextMaxChars || DEFAULT_CONFIG.contextMaxChars),
    historyMaxMessages: Number(config.historyMaxMessages || DEFAULT_CONFIG.historyMaxMessages),
    historyMaxChars: Number(config.historyMaxChars || DEFAULT_CONFIG.historyMaxChars),
    searchMaxMatches: Number(config.searchMaxMatches || DEFAULT_CONFIG.searchMaxMatches),
    allowedTools: normalizeArray(config.allowedTools),
    disallowedTools: normalizeArray(config.disallowedTools)
  };
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
