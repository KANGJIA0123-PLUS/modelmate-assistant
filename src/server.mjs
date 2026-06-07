import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { askClaude, askClaudeStream } from "./claude-runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const config = loadConfig();

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/config") {
      return sendJson(response, publicConfig());
    }

    if (request.method === "POST" && request.url === "/api/ask") {
      const body = await readJsonBody(request);
      const question = String(body.question || "").trim();
      const operator = normalizeOperator(body.operator);
      const history = sanitizeHistory(body.history);

      if (!question) {
        return sendJson(response, { error: "问题不能为空。" }, 400);
      }

      const result = await askClaude(question, config, { history });
      const payload = {
        answer: result.answer,
        elapsedMs: result.elapsedMs,
        quickReply: result.quickReply,
        operator,
        historyCount: history.length,
        context: result.context ? {
          terms: result.context.terms,
          usedFiles: result.context.usedFiles,
          fileMatchCount: result.context.fileMatchCount,
          contentMatchCount: result.context.contentMatchCount
        } : null,
        claude: summarizeClaudeResult(result.raw),
        stderr: result.stderr || undefined
      };

      await appendQuestionLog({
        operator,
        question,
        response: payload,
        request
      });

      return sendJson(response, payload);
    }

    if (request.method === "POST" && request.url === "/api/ask-stream") {
      const body = await readJsonBody(request);
      const question = String(body.question || "").trim();
      const operator = normalizeOperator(body.operator);
      const history = sanitizeHistory(body.history);

      if (!question) {
        return sendJson(response, { error: "问题不能为空。" }, 400);
      }

      return handleAskStream({ request, response, question, operator, history });
    }

    if (request.method === "GET") {
      return serveStatic(request, response);
    }

    sendJson(response, { error: "Method not allowed" }, 405);
  } catch (error) {
    sendJson(response, { error: error.message || String(error) }, 500);
  }
});

async function handleAskStream({ request, response, question, operator, history }) {
  const abortController = new AbortController();
  let responseEnded = false;

  response.on("close", () => {
    if (!responseEnded) {
      abortController.abort();
    }
  });

  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "Connection": "keep-alive"
  });

  const sendEvent = (event) => {
    response.write(`${JSON.stringify(event)}\n`);
  };

  sendEvent({ type: "start", operator, historyCount: history.length, startedAt: new Date().toISOString() });

  try {
    const result = await askClaudeStream(question, config, sendEvent, {
      history,
      signal: abortController.signal
    });
    const payload = {
      answer: result.answer,
      elapsedMs: result.elapsedMs,
      quickReply: result.quickReply,
      operator,
      historyCount: history.length,
      context: result.context ? {
        terms: result.context.terms,
        usedFiles: result.context.usedFiles,
        fileMatchCount: result.context.fileMatchCount,
        contentMatchCount: result.context.contentMatchCount
      } : null,
      claude: summarizeClaudeResult(result.raw),
      stderr: result.stderr || undefined
    };

    await appendQuestionLog({
      operator,
      question,
      response: payload,
      request
    });

    sendEvent({ type: "done", payload });
    responseEnded = true;
    response.end();
  } catch (error) {
    sendEvent({ type: "error", error: error.message || String(error) });
    responseEnded = true;
    response.end();
  }
}

server.listen(config.port, config.host, () => {
  console.log(`Ops answer assistant is running at http://${config.host}:${config.port}`);

  if (config.warnings.length > 0) {
    for (const warning of config.warnings) {
      console.warn(`Warning: ${warning}`);
    }
  }
});

function publicConfig() {
  return {
    host: config.host,
    port: config.port,
    loadedPath: config.loadedPath,
    sourceDirs: config.sourceDirs,
    questionLogPath: config.questionLogPath,
    model: config.model,
    displayModel: config.model || "Claude Code 默认",
    maxTurns: config.maxTurns,
    timeoutMs: config.timeoutMs,
    retrievalMode: config.retrievalMode,
    contextMaxChars: config.contextMaxChars,
    historyMaxMessages: config.historyMaxMessages,
    historyMaxChars: config.historyMaxChars,
    warnings: config.warnings,
    allowedTools: config.allowedTools,
    disallowedTools: config.disallowedTools
  };
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const maxMessages = Math.max(0, Math.min(20, Number(config.historyMaxMessages || 8)));
  const maxChars = Math.max(0, Math.min(20000, Number(config.historyMaxChars || 6000)));

  if (maxMessages <= 0 || maxChars <= 0) {
    return [];
  }

  const recent = value.slice(-maxMessages);
  const selected = [];
  let totalChars = 0;

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const item = recent[index] || {};
    const role = normalizeHistoryRole(item.role);
    const content = String(item.content || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);

    if (!role || !content) {
      continue;
    }

    const cost = role.length + content.length + 4;

    if (selected.length > 0 && totalChars + cost > maxChars) {
      break;
    }

    selected.unshift({ role, content });
    totalChars += cost;
  }

  return selected;
}

function normalizeHistoryRole(value) {
  const role = String(value || "").trim().toLowerCase();

  if (role === "user" || role === "assistant") {
    return role;
  }

  return "";
}

function normalizeOperator(value) {
  const operator = String(value || "").trim();

  if (!operator) {
    return "未填写账号";
  }

  return operator.slice(0, 80);
}

async function appendQuestionLog({ operator, question, response, request }) {
  const entry = {
    timestamp: new Date().toISOString(),
    operator,
    question,
    answerPreview: String(response.answer || "").slice(0, 1200),
    elapsedMs: response.elapsedMs,
    quickReply: Boolean(response.quickReply),
    historyMessageCount: Number(response.historyCount || 0),
    sources: response.context?.usedFiles || [],
    claude: response.claude ? {
      modelNames: response.claude.modelNames,
      numTurns: response.claude.numTurns,
      totalCostUsd: response.claude.totalCostUsd
    } : null,
    remoteAddress: request.socket.remoteAddress || "",
    userAgent: request.headers["user-agent"] || ""
  };

  await fs.promises.mkdir(path.dirname(config.questionLogPath), { recursive: true });
  await fs.promises.appendFile(config.questionLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function summarizeClaudeResult(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    sessionId: raw.session_id,
    totalCostUsd: raw.total_cost_usd,
    durationMs: raw.duration_ms,
    numTurns: raw.num_turns,
    modelNames: Object.keys(raw.modelUsage || {}),
    isError: raw.is_error
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString("utf8");

      if (body.length > 256 * 1024) {
        request.destroy();
        reject(new Error("请求体过大。"));
      }
    });

    request.on("end", () => {
      if (!body.trim()) {
        return resolve({});
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error(`JSON 解析失败：${error.message}`));
      }
    });
  });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(publicDir, relativePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      return response.end("Not found");
    }

    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };

  return types[ext] || "application/octet-stream";
}
