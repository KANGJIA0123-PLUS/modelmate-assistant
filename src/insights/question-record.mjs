import { assessAnswerQuality } from "./answer-quality.mjs";
import { classifyInsightQuestion } from "./question-classifier.mjs";
import { buildClusterForQuestion } from "./question-clusterer.mjs";
import { buildQuestionIdentity } from "./question-normalizer.mjs";
import { hashText, makeId, normalizeIsoDate } from "./ids.mjs";

export function buildInsightQuestionRecord(entry = {}) {
  const question = String(entry.question || "").trim();

  if (!question) {
    return null;
  }

  const createdAt = normalizeIsoDate(entry.timestamp || entry.createdAt);
  const versionId = String(entry.versionId || "default").trim() || "default";
  const identity = buildQuestionIdentity(question);
  const sources = Array.isArray(entry.sources) ? entry.sources : [];
  const quality = assessAnswerQuality({
    answerPreview: entry.answerPreview,
    elapsedMs: entry.elapsedMs,
    quickReply: entry.quickReply,
    sourceCount: sources.length || entry.sourceCount,
    isError: entry.claude?.isError,
    stderr: entry.stderr
  });
  const classification = classifyInsightQuestion({
    question,
    answerPreview: entry.answerPreview,
    answerStatus: quality.answerStatus,
    knowledgeHitStatus: quality.knowledgeHitStatus,
    isKnowledgeGap: quality.isKnowledgeGap,
    versionId
  });

  return {
    id: makeId("q", [createdAt, versionId, identity.questionHash, String(entry.answerPreview || "").slice(0, 240)]),
    createdAt,
    versionId,
    versionName: String(entry.versionName || versionId).trim().slice(0, 120),
    operator: String(entry.operator || "").trim().slice(0, 80),
    operatorHash: entry.operator ? hashText(entry.operator).slice(0, 24) : "",
    question,
    questionPreview: identity.questionPreview,
    redactedQuestion: identity.redactedQuestion,
    normalizedQuestion: identity.normalizedQuestion,
    questionHash: identity.questionHash,
    answerPreview: String(entry.answerPreview || "").trim().slice(0, 1200),
    answerStatus: quality.answerStatus,
    knowledgeHitStatus: quality.knowledgeHitStatus,
    isKnowledgeGap: quality.isKnowledgeGap || classification.categoryL1 === "knowledge_gap",
    categoryL1: classification.categoryL1,
    categoryL2: classification.categoryL2,
    intent: classification.intent,
    scenario: classification.scenario,
    isVersionRelated: classification.isVersionRelated,
    isPlatformImprovementSignal: classification.isPlatformImprovementSignal,
    elapsedMs: Number(entry.elapsedMs || 0),
    queueWaitMs: Number(entry.queueWaitMs || 0),
    sourceCount: sources.length || Number(entry.sourceCount || 0),
    modelNames: Array.isArray(entry.claude?.modelNames) ? entry.claude.modelNames : [],
    numTurns: entry.claude?.numTurns ?? null,
    totalCostUsd: entry.claude?.totalCostUsd ?? null,
    remoteAddressHash: entry.remoteAddress ? hashText(entry.remoteAddress).slice(0, 24) : "",
    userAgentHash: entry.userAgent ? hashText(entry.userAgent).slice(0, 24) : "",
    rawEvent: summarizeRawEvent(entry)
  };
}

export async function recordInsightEntry(store, entry) {
  if (!store?.enabled) {
    return null;
  }

  const record = buildInsightQuestionRecord(entry);

  if (!record) {
    return null;
  }

  const saved = await store.saveQuestion(record);

  if (!saved) {
    return null;
  }

  const clusterResult = await store.listClusters?.({
    versionId: record.versionId,
    limit: 200
  });
  const nearbyClusters = clusterResult?.items || [];
  await store.upsertCluster(buildClusterForQuestion(record, nearbyClusters));
  return record;
}

function summarizeRawEvent(entry) {
  return {
    timestamp: entry.timestamp || entry.createdAt || "",
    quickReply: Boolean(entry.quickReply),
    historyMessageCount: Number(entry.historyMessageCount || 0),
    sourceCount: Array.isArray(entry.sources) ? entry.sources.length : Number(entry.sourceCount || 0),
    claude: entry.claude ? {
      modelNames: entry.claude.modelNames,
      numTurns: entry.claude.numTurns,
      totalCostUsd: entry.claude.totalCostUsd
    } : null
  };
}
