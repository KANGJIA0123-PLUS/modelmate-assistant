import { buildInsightSnapshot } from "./insight-aggregator.mjs";
import { buildReportInsightPrompt } from "./insight-prompt-builder.mjs";
import { runInsightLlm } from "./llm-insight-runner.mjs";
import { scorePriority } from "./priority-scorer.mjs";
import { renderReportMarkdown } from "./report-renderer.mjs";
import { makeId } from "./ids.mjs";
import { recordInsightMetric, withInsightSpan } from "./insight-telemetry.mjs";

export async function generateInsightReport({ store, config, versionRegistry, request = {} }) {
  return withInsightSpan("insights.report.generate", {
    type: request.type || "weekly",
    versionId: request.versionId || "all"
  }, async () => generateInsightReportInner({ store, config, versionRegistry, request }));
}

async function generateInsightReportInner({ store, config, versionRegistry, request = {} }) {
  const type = normalizeReportType(request.type);
  const versionId = normalizeReportVersion(request.versionId, type);
  const snapshot = await buildInsightSnapshot({
    store,
    config,
    versionRegistry,
    query: {
      ...request,
      type,
      versionId
    }
  });
  const wantLlm = Boolean(request.llmEnhanced);
  const allowLlm = Boolean(config.insights?.llmEnhanced);
  let llmAnalysis = null;
  let llmStatus = "disabled";

  if (wantLlm && allowLlm) {
    const prompt = buildReportInsightPrompt(snapshot, {
      maxPromptChars: config.insights?.maxPromptChars
    });
    llmAnalysis = await runInsightLlm(prompt, config, { store });
    llmStatus = llmAnalysis ? "success" : "partial";
  } else if (wantLlm && !allowLlm) {
    llmStatus = "disabled_by_config";
  }

  const generatedAt = new Date().toISOString();
  const reportId = makeId("report", [type, versionId, snapshot.range.startAt, snapshot.range.endAt, generatedAt]);
  const reportJson = buildReportJson({
    reportId,
    type,
    versionId,
    snapshot,
    llmAnalysis,
    llmStatus,
    generatedAt
  });
  const markdown = renderReportMarkdown(reportJson);
  const report = await store.saveReport({
    reportId,
    type,
    title: reportJson.title,
    versionId,
    rangeStart: snapshot.range.startAt,
    rangeEnd: snapshot.range.endAt,
    status: "ready",
    llmEnhanced: llmStatus === "success",
    llmStatus,
    generatedAt,
    reportJson,
    markdown,
    metrics: reportJson.metrics
  });

  await persistReportArtifacts(store, reportJson);
  recordInsightMetric("report_generated_count", 1, {
    reportId,
    type,
    versionId,
    status: "ready"
  });
  recordInsightMetric("suggestion_count", reportJson.platformImprovementSuggestions.length, {
    reportId,
    type
  });

  return {
    reportId: report.reportId,
    report: await store.getReport(report.reportId)
  };
}

function buildReportJson({ reportId, type, versionId, snapshot, llmAnalysis, llmStatus, generatedAt }) {
  const platformImprovementSuggestions = buildPlatformSuggestions(snapshot, llmAnalysis);
  const efficiencyOpportunities = mergeEfficiency(snapshot.efficiencyOpportunities, llmAnalysis?.skillCandidates);
  const actionItems = buildActionItems(platformImprovementSuggestions, efficiencyOpportunities, llmAnalysis?.actionItems);

  return {
    reportId,
    title: "辅助运营平台数据洞察报告",
    type,
    versionId,
    generatedAt,
    range: snapshot.range,
    llmStatus,
    metrics: snapshot.metrics,
    overview: snapshot.overview,
    categories: snapshot.categories,
    frequentQuestions: snapshot.frequentQuestions,
    versions: snapshot.versions,
    knowledgeGaps: snapshot.knowledgeGaps,
    platformImprovementSuggestions,
    efficiencyOpportunities,
    faqCandidates: buildFaqCandidates(snapshot, llmAnalysis),
    skillCandidates: buildSkillCandidates(snapshot, llmAnalysis),
    actionItems,
    sections: {
      summary: llmAnalysis?.summary || "",
      risks: Array.isArray(llmAnalysis?.riskNotes) && llmAnalysis.riskNotes.length
        ? llmAnalysis.riskNotes.map((item) => `- ${item}`).join("\n")
        : ""
    }
  };
}

function buildPlatformSuggestions(snapshot, llmAnalysis) {
  const deterministic = snapshot.improvementSuggestions.map((item) => {
    const score = scorePriority({
      impact: item.evidence?.questionCount >= 5 ? 4 : 3,
      severity: item.type === "knowledge" ? 4 : 3,
      frequency: item.evidence?.questionCount >= 5 ? 4 : 3,
      confidence: 3,
      effort: 3
    });
    return {
      type: item.type || "platform",
      title: item.title,
      description: item.description,
      relatedClusterIds: item.relatedClusterIds || [],
      evidence: item.evidence || {},
      ...score
    };
  });
  const llmSuggestions = Array.isArray(llmAnalysis?.platformImprovementSuggestions)
    ? llmAnalysis.platformImprovementSuggestions.map((item) => ({
        type: item.type || "platform",
        title: String(item.title || "").slice(0, 160),
        description: String(item.description || "").slice(0, 1000),
        relatedClusterIds: Array.isArray(item.relatedClusterIds) ? item.relatedClusterIds.map(String) : [],
        metricKey: String(item.metricKey || ""),
        evidence: { source: "llm" },
        ...scorePriority(item)
      })).filter((item) => item.title)
    : [];

  return dedupeByTitle([...deterministic, ...llmSuggestions]).slice(0, 30);
}

function buildFaqCandidates(snapshot, llmAnalysis) {
  const deterministic = snapshot.frequentQuestions
    .filter((item) => item.questionCount >= 3)
    .map((item) => ({
      clusterId: item.clusterId,
      question: item.representativeQuestion || item.title,
      answerSummary: item.suggestedAction || "建议沉淀标准答案。",
      evidence: { questionCount: item.questionCount, versionId: item.versionId }
    }));
  const llmCandidates = Array.isArray(llmAnalysis?.faqCandidates) ? llmAnalysis.faqCandidates : [];
  return dedupeByKey([...deterministic, ...llmCandidates], (item) => `${item.clusterId}:${item.question}`).slice(0, 30);
}

function buildSkillCandidates(snapshot, llmAnalysis) {
  const deterministic = snapshot.efficiencyOpportunities
    .filter((item) => item.type === "skill")
    .map((item) => ({
      title: item.title,
      triggerScenario: item.description,
      inputSummary: "用户问题、当前版本、只读知识源检索结果。",
      outputSummary: "结构化排查步骤、引用依据和下一步建议。",
      relatedClusterIds: item.relatedClusterIds || [],
      evidence: { questionCount: item.questionCount }
    }));
  const llmCandidates = Array.isArray(llmAnalysis?.skillCandidates) ? llmAnalysis.skillCandidates : [];
  return dedupeByKey([...deterministic, ...llmCandidates], (item) => item.title).slice(0, 30);
}

function mergeEfficiency(base, skillCandidates = []) {
  const fromLlm = Array.isArray(skillCandidates)
    ? skillCandidates.map((item) => ({
        type: "skill",
        title: item.title,
        description: item.triggerScenario || "模型建议沉淀为 Skill。",
        relatedClusterIds: item.relatedClusterIds || [],
        questionCount: 0,
        priorityHint: "P2"
      })).filter((item) => item.title)
    : [];
  return dedupeByTitle([...base, ...fromLlm]).slice(0, 30);
}

function buildActionItems(suggestions, opportunities, llmActionItems = []) {
  const deterministic = suggestions.slice(0, 8).map((item) => ({
    title: item.title,
    description: item.description,
    priority: item.priority,
    expectedBenefit: "降低重复咨询并提升知识命中率。",
    relatedClusterIds: item.relatedClusterIds || []
  }));
  const fromOpportunities = opportunities.slice(0, 5).map((item) => ({
    title: item.title,
    description: item.description,
    priority: item.priorityHint || "P2",
    expectedBenefit: "减少重复问答和人工解释成本。",
    relatedClusterIds: item.relatedClusterIds || []
  }));
  const fromLlm = Array.isArray(llmActionItems)
    ? llmActionItems.map((item) => ({
        title: String(item.title || "").slice(0, 160),
        description: String(item.description || item.priorityReason || "").slice(0, 1000),
        priority: "P2",
        expectedBenefit: item.priorityReason || "",
        relatedClusterIds: Array.isArray(item.relatedClusterIds) ? item.relatedClusterIds : []
      })).filter((item) => item.title)
    : [];
  return dedupeByTitle([...deterministic, ...fromOpportunities, ...fromLlm]).slice(0, 12);
}

async function persistReportArtifacts(store, reportJson) {
  for (const suggestion of reportJson.platformImprovementSuggestions || []) {
    await store.saveSuggestion({
      reportId: reportJson.reportId,
      type: suggestion.type,
      title: suggestion.title,
      description: suggestion.description,
      priority: suggestion.priority,
      priorityScore: suggestion.priorityScore,
      relatedClusterIds: suggestion.relatedClusterIds,
      evidence: suggestion.evidence
    });
  }

  for (const candidate of reportJson.faqCandidates || []) {
    await store.saveFaqCandidate({
      reportId: reportJson.reportId,
      clusterId: candidate.clusterId,
      question: candidate.question,
      answerSummary: candidate.answerSummary,
      evidence: candidate.evidence
    });
  }

  for (const candidate of reportJson.skillCandidates || []) {
    await store.saveSkillCandidate({
      reportId: reportJson.reportId,
      title: candidate.title,
      triggerScenario: candidate.triggerScenario,
      inputSummary: candidate.inputSummary,
      outputSummary: candidate.outputSummary,
      evidence: candidate.evidence
    });
  }
}

function normalizeReportType(value) {
  const type = String(value || "weekly").trim();
  return ["weekly", "monthly", "version", "custom"].includes(type) ? type : "weekly";
}

function normalizeReportVersion(value, type) {
  const versionId = String(value || "").trim();
  if (type === "version") {
    return versionId || "default";
  }
  return versionId || "all";
}

function dedupeByTitle(items) {
  return dedupeByKey(items, (item) => String(item.title || "").trim());
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}
