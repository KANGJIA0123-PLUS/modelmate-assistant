import { spawn } from "node:child_process";
import { retrieveLocalContext } from "./retriever.mjs";

export async function askClaude(question, config, versionContext = null, options = {}) {
  const scopedConfig = buildVersionScopedConfig(config, versionContext);
  const quickReply = getQuickReply(question);
  const startedAt = Date.now();
  const history = normalizeHistory(options.history, scopedConfig);

  if (quickReply) {
    return {
      answer: quickReply,
      raw: null,
      stderr: "",
      context: null,
      quickReply: true,
      elapsedMs: Date.now() - startedAt
    };
  }

  const context = scopedConfig.retrievalMode === "claude-tools"
    ? null
    : await retrieveLocalContext(question, scopedConfig);
  const prompt = buildPrompt(question, scopedConfig, context, history, versionContext);
  const args = buildClaudeArgs(prompt, scopedConfig);
  const { stdout, stderr, exitCode } = await runProcess(scopedConfig.effectiveClaudePath, args, {
    cwd: scopedConfig.workingDirectory,
    timeoutMs: scopedConfig.timeoutMs
  });

  if (exitCode !== 0) {
    throw new Error(formatClaudeError(stderr || stdout || `Claude Code exited with code ${exitCode}`));
  }

  const parsed = parseClaudeOutput(stdout);

  return {
    answer: parsed.answer,
    raw: parsed.raw,
    stderr: stderr.trim(),
    context,
    quickReply: false,
    elapsedMs: Date.now() - startedAt
  };
}

export async function askClaudeStream(question, config, versionContext = null, onEvent, options = {}) {
  const scopedConfig = buildVersionScopedConfig(config, versionContext);
  const quickReply = getQuickReply(question);
  const startedAt = Date.now();
  const history = normalizeHistory(options.history, scopedConfig);

  if (history.length > 0) {
    onEvent({ type: "history", count: history.length, versionId: versionContext?.id || "" });
  }

  if (quickReply) {
    onEvent({ type: "delta", text: quickReply });
    return {
      answer: quickReply,
      raw: null,
      stderr: "",
      context: null,
      quickReply: true,
      elapsedMs: Date.now() - startedAt
    };
  }

  onEvent({
    type: "status",
    versionId: versionContext?.id || "",
    message: scopedConfig.retrievalMode === "claude-tools" ? "正在准备版本化只读工具..." : "正在检索当前版本资料..."
  });
  const context = scopedConfig.retrievalMode === "claude-tools"
    ? null
    : await retrieveLocalContext(question, scopedConfig);
  onEvent({ type: "context", versionId: versionContext?.id || "", context: summarizeContext(context) });
  onEvent({ type: "status", versionId: versionContext?.id || "", message: "已交给 Claude Code，等待模型首个输出..." });

  const prompt = buildPrompt(question, scopedConfig, context, history, versionContext);
  const args = buildClaudeArgs(prompt, scopedConfig, { stream: true });
  const result = await runStreamProcess(scopedConfig.effectiveClaudePath, args, {
    cwd: scopedConfig.workingDirectory,
    timeoutMs: scopedConfig.timeoutMs,
    signal: options.signal,
    versionId: versionContext?.id || "",
    onEvent
  });

  return {
    answer: result.answer,
    raw: result.raw,
    stderr: result.stderr.trim(),
    context,
    quickReply: false,
    elapsedMs: Date.now() - startedAt
  };
}

export function buildPrompt(question, config, context = null, history = [], versionContext = null) {
  const sourceList = config.sourceDirs.map((dir, index) => `${index + 1}. ${dir}`).join("\n");
  const normalizedHistory = normalizeHistory(history, config);
  const versionBlock = formatVersionBlock(versionContext);
  const contextBlock = context
    ? [
        "本地预检索片段：",
        context.text || "没有检索到直接相关片段。",
        "",
        "预检索说明：这些片段可能不完整。若本地没有命中，且用户没有明确要求只基于本地资料，可以使用模型通用知识回答，并友好说明来源边界。"
      ].join("\n")
    : "请使用 Claude Code 的只读工具在知识源目录中查证。";

  return [
    "请作为现网接口人的知识助手回答下面的问题。",
    "",
    versionBlock,
    "",
    "知识源目录：",
    sourceList || "没有可用知识源目录。",
    "",
    contextBlock,
    "",
    formatHistoryBlock(normalizedHistory),
    "",
    "回答规则：",
    "1. 内部现网、接口、配置、日志、代码、流程类问题优先使用本地资料、Markdown 文档和代码仓中的事实。",
    "2. 只能查阅和引用当前版本的知识源目录；不要跨版本混用资料、代码或历史经验。",
    "3. 本地资料命中时，回答中尽量给出文件路径；能定位到代码或段落时，给出函数名、配置名、接口名或行号。",
    "4. 当前版本资料没有命中时，如果问题属于通用知识、公开背景、概念解释或非内部信息，可以使用模型通用知识回答；开头用一句友好提示说明“当前版本知识库暂未命中，以下基于模型通用知识”。",
    "5. 如果用户明确要求只根据本地资料、指定文档或指定代码回答，则不要使用模型通用知识；资料不足时说明缺什么。",
    "6. 对涉及最新动态、公司内部事实、现网状态、法律、医疗、金融、安全等高风险或强时效问题，不要仅凭模型通用知识下确定结论，要提示用户补充资料或核验来源。",
    "7. 不要修改、创建、删除文件；只做只读检索和阅读。",
    "8. 回答使用中文，先给结论，再给依据和下一步建议。",
    "",
    "用户问题：",
    question
  ].join("\n");
}

function buildVersionScopedConfig(config, versionContext) {
  if (!versionContext) {
    return {
      ...config,
      effectiveClaudePath: config.effectiveClaudePath || config.claudePath
    };
  }

  return {
    ...config,
    workingDirectory: versionContext.workingDirectory || config.workingDirectory,
    sourceDirs: Array.isArray(versionContext.sourceDirs) ? versionContext.sourceDirs : [],
    effectiveClaudePath: config.effectiveClaudePath || config.claudePath
  };
}

function formatVersionBlock(versionContext) {
  if (!versionContext) {
    return "当前版本：未指定版本。";
  }

  const tags = Array.isArray(versionContext.tags) && versionContext.tags.length > 0
    ? versionContext.tags.join(", ")
    : "无";

  return [
    "当前版本：",
    `- versionId: ${versionContext.id}`,
    `- versionName: ${versionContext.name}`,
    `- status: ${versionContext.status}`,
    `- tags: ${tags}`,
    "版本边界：本次回答只能使用当前版本目录中的资料和代码；如果资料不足，请说明缺口。"
  ].join("\n");
}

function formatHistoryBlock(history) {
  if (history.length === 0) {
    return "本轮对话上下文：没有历史上下文。";
  }

  const lines = history.map((item, index) => {
    const role = item.role === "assistant" ? "助手" : "用户";
    return `${index + 1}. ${role}：${item.content}`;
  });

  return [
    `本轮对话上下文（最近 ${history.length} 条）：`,
    ...lines,
    "",
    "上下文说明：这些历史消息只用于理解追问、代词和用户偏好。若历史与当前问题或可查证本地资料冲突，以当前问题和本地资料为准。"
  ].join("\n");
}

function normalizeHistory(history, config) {
  if (!Array.isArray(history)) {
    return [];
  }

  const maxMessages = clampNumber(config.historyMaxMessages, 0, 20, 8);
  const maxChars = clampNumber(config.historyMaxChars, 0, 20000, 6000);

  if (maxMessages <= 0 || maxChars <= 0) {
    return [];
  }

  const recent = history
    .map((item) => ({
      role: normalizeRole(item?.role),
      content: normalizeHistoryContent(item?.content)
    }))
    .filter((item) => item.role && item.content)
    .slice(-maxMessages);

  const selected = [];
  let totalChars = 0;

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const item = recent[index];
    const cost = item.content.length + item.role.length + 4;

    if (selected.length > 0 && totalChars + cost > maxChars) {
      break;
    }

    selected.unshift(item);
    totalChars += cost;
  }

  return selected;
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();

  if (normalized === "user" || normalized === "assistant") {
    return normalized;
  }

  return "";
}

function normalizeHistoryContent(content) {
  return String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, number));
}

function buildClaudeArgs(prompt, config, options = {}) {
  const useClaudeTools = config.retrievalMode === "claude-tools";
  const args = [
    "-p",
    prompt,
    "--output-format",
    options.stream ? "stream-json" : "json",
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--max-turns",
    String(config.maxTurns)
  ];

  if (options.stream) {
    args.push("--verbose", "--include-partial-messages");
  }

  if (config.model) {
    args.push("--model", String(config.model));
  }

  if (Number.isFinite(config.maxBudgetUsd) && config.maxBudgetUsd > 0) {
    args.push("--max-budget-usd", String(config.maxBudgetUsd));
  }

  if (config.systemPrompt) {
    args.push("--append-system-prompt", String(config.systemPrompt));
  }

  if (useClaudeTools && config.allowedTools.length > 0) {
    args.push("--tools", config.allowedTools.join(","));
    args.push("--allowedTools", config.allowedTools.join(","));
  } else {
    args.push("--tools", "");
  }

  if (useClaudeTools && config.disallowedTools.length > 0) {
    args.push("--disallowedTools", config.disallowedTools.join(","));
  }

  if (useClaudeTools && config.sourceDirs.length > 0) {
    args.push("--add-dir", ...config.sourceDirs);
  }

  return args;
}

function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
    });

    let stdout = "";
    let stderr = "";
    let isDone = false;
    const timer = setTimeout(() => {
      if (isDone) {
        return;
      }

      child.kill("SIGTERM");
      reject(new Error(`Claude Code 调用超时，已超过 ${Math.round(options.timeoutMs / 1000)} 秒。`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      isDone = true;
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      isDone = true;
      resolve({ stdout, stderr, exitCode });
    });
  });
}

function runStreamProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        NO_COLOR: "1"
      }
    });

    let stdoutBuffer = "";
    let stderr = "";
    let answer = "";
    let raw = null;
    let isDone = false;
    let lastThinkingStatusAt = 0;
    const timer = setTimeout(() => {
      if (isDone) {
        return;
      }

      child.kill("SIGTERM");
      reject(new Error(`Claude Code 调用超时，已超过 ${Math.round(options.timeoutMs / 1000)} 秒。`));
    }, options.timeoutMs);

    const abort = () => {
      if (!isDone) {
        child.kill("SIGTERM");
      }
    };

    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const parsed = parseStreamLine(line);

        if (!parsed) {
          continue;
        }

        if (parsed.type === "system" && parsed.subtype === "init") {
          options.onEvent({ type: "meta", versionId: options.versionId || "", model: parsed.model, sessionId: parsed.session_id });
          continue;
        }

        if (parsed.type === "system" && parsed.subtype === "status") {
          options.onEvent({ type: "status", versionId: options.versionId || "", message: formatStreamStatus(parsed.status) });
          continue;
        }

        if (parsed.type === "stream_event") {
          const event = parsed.event || {};
          const delta = event.delta || {};

          if (event.type === "message_start") {
            options.onEvent({ type: "meta", versionId: options.versionId || "", model: event.message?.model });
          }

          if (delta.type === "text_delta" && delta.text) {
            answer += delta.text;
            options.onEvent({ type: "delta", text: delta.text });
          }

          if (delta.type === "thinking_delta") {
            const now = Date.now();

            if (now - lastThinkingStatusAt > 1500) {
              lastThinkingStatusAt = now;
              options.onEvent({ type: "status", versionId: options.versionId || "", message: "模型正在思考..." });
            }
          }

          continue;
        }

        if (parsed.type === "result") {
          raw = parsed;

          if (!answer && typeof parsed.result === "string") {
            answer = parsed.result;
            options.onEvent({ type: "delta", text: parsed.result });
          }
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      isDone = true;
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      isDone = true;

      if (options.signal?.aborted) {
        return reject(new Error("请求已取消。"));
      }

      if (exitCode !== 0 || raw?.is_error) {
        return reject(new Error(formatClaudeError(stderr || raw?.result || answer || `Claude Code exited with code ${exitCode}`)));
      }

      resolve({ answer, raw, stderr });
    });
  });
}

function parseClaudeOutput(stdout) {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return { answer: "", raw: null };
  }

  try {
    const raw = JSON.parse(trimmed);
    return {
      answer: extractAnswer(raw),
      raw
    };
  } catch {
    return {
      answer: trimmed,
      raw: null
    };
  }
}

function extractAnswer(raw) {
  if (typeof raw?.result === "string") {
    return raw.result;
  }

  if (typeof raw?.content === "string") {
    return raw.content;
  }

  if (Array.isArray(raw?.message?.content)) {
    return raw.message.content
      .map((item) => item.text || "")
      .filter(Boolean)
      .join("\n");
  }

  if (typeof raw?.message?.content === "string") {
    return raw.message.content;
  }

  return JSON.stringify(raw, null, 2);
}

function formatClaudeError(message) {
  const cleaned = message.trim();

  if (!cleaned) {
    return "Claude Code 调用失败，但没有返回错误信息。";
  }

  return cleaned;
}

function parseStreamLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function formatStreamStatus(status) {
  const statusMap = {
    requesting: "正在请求模型...",
    waiting: "正在等待模型...",
    connected: "已连接模型..."
  };

  return statusMap[status] || "Claude Code 正在处理...";
}

function summarizeContext(context) {
  if (!context) {
    return null;
  }

  return {
    terms: context.terms,
    usedFiles: context.usedFiles,
    fileMatchCount: context.fileMatchCount,
    contentMatchCount: context.contentMatchCount
  };
}

function getQuickReply(question) {
  const normalized = question
    .trim()
    .replace(/[。！？!?,，\s]/g, "")
    .toLowerCase();

  const greetings = new Set([
    "你好",
    "您好",
    "hi",
    "hello",
    "hey",
    "嗨",
    "哈喽",
    "在吗",
    "在不在"
  ]);

  if (!greetings.has(normalized)) {
    return "";
  }

  return "我在。你可以问现网接口、配置、日志、排障手册或代码仓相关问题，也可以问通用知识问题；我会优先检索本地知识源，本地没命中时再基于模型通用知识回答并提示来源边界。";
}
