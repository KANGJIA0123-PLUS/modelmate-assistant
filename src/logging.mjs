import fs from "node:fs/promises";
import path from "node:path";
import { recordInsightEntry } from "./insights/question-record.mjs";
import { getClientIp } from "./request-utils.mjs";

export function createQuestionLogger({ config, historyStore, insightStore }) {
  return async function logQuestion({ operator, versionContext, question, response, request }) {
    const entry = buildQuestionLogEntry({
      operator,
      versionContext,
      question,
      response,
      request
    });

    await appendQuestionLog(config.questionLogPath, entry);
    await recordQuestionHistory(historyStore, entry);
    await recordQuestionInsights(insightStore, entry);
    return entry;
  };
}

export function summarizeClaudeResult(raw) {
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

function buildQuestionLogEntry({ operator, versionContext, question, response, request }) {
  return {
    timestamp: new Date().toISOString(),
    operator,
    versionId: versionContext?.id || "",
    versionName: versionContext?.name || "",
    question,
    answerPreview: String(response.answer || "").slice(0, 1200),
    elapsedMs: response.elapsedMs,
    queueWaitMs: Number(response.queueWaitMs || 0),
    quickReply: Boolean(response.quickReply),
    historyMessageCount: Number(response.historyCount || 0),
    sources: response.context?.usedFiles || [],
    claude: response.claude ? {
      modelNames: response.claude.modelNames,
      numTurns: response.claude.numTurns,
      totalCostUsd: response.claude.totalCostUsd
    } : null,
    remoteAddress: getClientIp(request),
    userAgent: request.headers["user-agent"] || ""
  };
}

async function appendQuestionLog(questionLogPath, entry) {
  await fs.mkdir(path.dirname(questionLogPath), { recursive: true });
  await fs.appendFile(questionLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function recordQuestionHistory(historyStore, entry) {
  if (!historyStore.enabled) {
    return;
  }

  try {
    await historyStore.record(entry);
  } catch (error) {
    console.warn(`Warning: 历史数据库写入失败：${error.message || String(error)}`);
  }
}

async function recordQuestionInsights(insightStore, entry) {
  if (!insightStore.enabled) {
    return;
  }

  try {
    await recordInsightEntry(insightStore, entry);
  } catch (error) {
    console.warn(`Warning: 洞察数据库写入失败：${error.message || String(error)}`);
  }
}
