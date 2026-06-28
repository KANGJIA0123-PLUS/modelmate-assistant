import { CATEGORY_L2_NAMES, CATEGORY_NAMES } from "./question-taxonomy.mjs";
import { recordInsightMetric } from "./insight-telemetry.mjs";
import { normalizeVersionFilter, parseTimeRange } from "./time-range.mjs";

const MAX_ANALYSIS_ROWS = 20000;

export async function buildInsightSnapshot({ store, config, versionRegistry, query = {} }) {
  const range = parseTimeRange({
    ...query,
    defaultRangeDays: config.insights?.defaultRangeDays || 7
  });
  const versionId = normalizeVersionFilter(query.versionId);
  const filter = {
    versionId,
    rangeStart: range.startAt,
    rangeEnd: range.endAt,
    limit: MAX_ANALYSIS_ROWS
  };
  const questionResult = await store.listQuestions(filter);
  const clusterResult = await store.listClusters(filter);
  const suggestionResult = await store.listSuggestions({ status: query.status || "open", limit: 200 });
  const questions = questionResult?.items || [];
  const clusters = clusterResult?.items || [];
  const suggestions = suggestionResult?.items || [];
  const versionMap = buildVersionMap(versionRegistry);
  const overview = buildOverview(questions, clusters, suggestions, range, versionId);
  recordInsightMetric("cluster_count", clusters.length, { versionId });

  return {
    enabled: store.enabled,
    generatedAt: new Date().toISOString(),
    range,
    versionId,
    overview,
    metrics: overview.metrics,
    categories: buildCategoryDistribution(questions),
    frequentQuestions: buildFrequentQuestions(clusters, questions, config),
    versions: buildVersionDistribution(questions, versionMap),
    knowledgeGaps: buildKnowledgeGaps(questions, clusters),
    improvementSuggestions: buildImprovementSuggestions(questions, clusters, suggestions),
    efficiencyOpportunities: buildEfficiencyOpportunities(clusters, questions, suggestions, config)
  };
}

function buildOverview(questions, clusters, suggestions, range, versionId) {
  const totalQuestions = questions.length;
  const failedQuestions = questions.filter((item) => isFailure(item)).length;
  const knowledgeGapQuestions = questions.filter((item) => item.isKnowledgeGap).length;
  const knowledgeHitQuestions = questions.filter((item) => item.knowledgeHitStatus === "full" || item.knowledgeHitStatus === "partial").length;
  const repeatedQuestions = clusters.filter((cluster) => cluster.questionCount >= 2).reduce((sum, cluster) => sum + cluster.questionCount, 0);
  const highFrequencyClusterCount = clusters.filter((cluster) => cluster.questionCount >= 2).length;
  const avgElapsedMs = average(questions.map((item) => item.elapsedMs));
  const avgQueueWaitMs = average(questions.map((item) => item.queueWaitMs || 0));
  const platformSignals = questions.filter((item) => item.isPlatformImprovementSignal).length;

  return {
    range,
    versionId,
    metrics: {
      totalQuestions,
      effectiveQuestions: totalQuestions - failedQuestions,
      highFrequencyClusterCount,
      knowledgeGapRate: rate(knowledgeGapQuestions, totalQuestions),
      knowledgeHitRate: rate(knowledgeHitQuestions, totalQuestions),
      repetitionRate: rate(repeatedQuestions, totalQuestions),
      avgElapsedMs,
      avgQueueWaitMs,
      failureRate: rate(failedQuestions, totalQuestions),
      aiOpportunityCount: highFrequencyClusterCount + platformSignals + suggestions.length
    },
    counts: {
      failedQuestions,
      knowledgeGapQuestions,
      knowledgeHitQuestions,
      repeatedQuestions,
      platformSignals,
      versionCount: new Set(questions.map((item) => item.versionId)).size
    }
  };
}

function buildCategoryDistribution(questions) {
  const groups = new Map();

  for (const question of questions) {
    const key = `${question.categoryL1 || "other"}::${question.categoryL2 || "unclear"}`;
    const current = groups.get(key) || {
      categoryL1: question.categoryL1 || "other",
      categoryL1Name: CATEGORY_NAMES[question.categoryL1] || "其他",
      categoryL2: question.categoryL2 || "unclear",
      categoryL2Name: CATEGORY_L2_NAMES[question.categoryL2] || "无法判断",
      questionCount: 0,
      avgElapsedMsValues: [],
      knowledgeGapCount: 0
    };
    current.questionCount += 1;
    current.avgElapsedMsValues.push(question.elapsedMs || 0);
    current.knowledgeGapCount += question.isKnowledgeGap ? 1 : 0;
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((item) => ({
      categoryL1: item.categoryL1,
      categoryL1Name: item.categoryL1Name,
      categoryL2: item.categoryL2,
      categoryL2Name: item.categoryL2Name,
      questionCount: item.questionCount,
      percent: rate(item.questionCount, questions.length),
      avgElapsedMs: average(item.avgElapsedMsValues),
      knowledgeGapCount: item.knowledgeGapCount
    }))
    .sort((a, b) => b.questionCount - a.questionCount);
}

function buildFrequentQuestions(clusters, questions, config) {
  const latestByCluster = new Map();

  for (const question of questions) {
    const clusterId = `cluster_${question.questionHash ? "" : ""}`;
    const candidates = clusters.filter((cluster) => cluster.questionHash === question.questionHash && cluster.versionId === question.versionId);
    for (const cluster of candidates) {
      const existing = latestByCluster.get(cluster.clusterId);
      if (!existing || question.createdAt > existing.createdAt) {
        latestByCluster.set(cluster.clusterId, question);
      }
    }
  }

  return clusters
    .slice()
    .sort((a, b) => b.questionCount - a.questionCount || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, config.insights?.topClusterLimit || 10)
    .map((cluster) => {
      const latest = latestByCluster.get(cluster.clusterId);
      return {
        clusterId: cluster.clusterId,
        title: cluster.title,
        representativeQuestion: cluster.representativeQuestion,
        questionCount: cluster.questionCount,
        categoryL1: cluster.categoryL1,
        categoryL1Name: CATEGORY_NAMES[cluster.categoryL1] || "其他",
        categoryL2: cluster.categoryL2,
        categoryL2Name: CATEGORY_L2_NAMES[cluster.categoryL2] || "无法判断",
        versionId: cluster.versionId,
        firstSeenAt: cluster.firstSeenAt,
        lastSeenAt: cluster.lastSeenAt,
        trend: "stable",
        answerStatus: latest?.answerStatus || "unknown",
        knowledgeHitStatus: latest?.knowledgeHitStatus || "unknown",
        suggestedAction: suggestActionForCluster(cluster, latest)
      };
    });
}

function buildVersionDistribution(questions, versionMap) {
  const groups = new Map();

  for (const question of questions) {
    const current = groups.get(question.versionId) || {
      versionId: question.versionId,
      versionName: versionMap.get(question.versionId)?.name || question.versionName || question.versionId,
      questionCount: 0,
      failedCount: 0,
      knowledgeGapCount: 0,
      avgElapsedValues: []
    };
    current.questionCount += 1;
    current.failedCount += isFailure(question) ? 1 : 0;
    current.knowledgeGapCount += question.isKnowledgeGap ? 1 : 0;
    current.avgElapsedValues.push(question.elapsedMs || 0);
    groups.set(question.versionId, current);
  }

  return [...groups.values()]
    .map((item) => ({
      versionId: item.versionId,
      versionName: item.versionName,
      questionCount: item.questionCount,
      failureRate: rate(item.failedCount, item.questionCount),
      knowledgeGapRate: rate(item.knowledgeGapCount, item.questionCount),
      avgElapsedMs: average(item.avgElapsedValues)
    }))
    .sort((a, b) => b.questionCount - a.questionCount);
}

function buildKnowledgeGaps(questions, clusters) {
  const gapQuestions = questions.filter((question) => question.isKnowledgeGap || question.categoryL1 === "knowledge_gap");
  const clusterByHash = new Map(clusters.map((cluster) => [`${cluster.versionId}:${cluster.questionHash}`, cluster]));

  return gapQuestions.slice(0, 50).map((question) => {
    const cluster = clusterByHash.get(`${question.versionId}:${question.questionHash}`);
    return {
      id: question.id,
      clusterId: cluster?.clusterId || "",
      title: cluster?.title || question.questionPreview,
      versionId: question.versionId,
      categoryL2: question.categoryL2,
      reason: question.knowledgeHitStatus === "none" ? "来源不足或未命中" : "回答提示需要补充资料",
      questionCount: cluster?.questionCount || 1,
      lastSeenAt: question.createdAt
    };
  });
}

function buildImprovementSuggestions(questions, clusters, savedSuggestions) {
  const derived = clusters
    .filter((cluster) => cluster.categoryL1 === "platform_improvement")
    .slice(0, 20)
    .map((cluster) => ({
      id: `derived_${cluster.clusterId}`,
      type: "platform",
      title: `优化：${cluster.title}`,
      description: "该问题簇多次反映平台体验或能力诉求，建议进入产品改进池。",
      priority: cluster.questionCount >= 5 ? "P1" : "P2",
      priorityScore: cluster.questionCount >= 5 ? 3.2 : 2.6,
      status: "candidate",
      relatedClusterIds: [cluster.clusterId],
      evidence: {
        questionCount: cluster.questionCount,
        versionId: cluster.versionId
      }
    }));
  const signalCount = questions.filter((question) => question.isPlatformImprovementSignal).length;

  if (signalCount > 0 && derived.length === 0) {
    derived.push({
      id: "derived_platform_signal",
      type: "platform",
      title: "梳理平台体验优化诉求",
      description: "本周期出现平台改进信号，建议人工复核并归并到产品待办。",
      priority: "P2",
      priorityScore: 2.5,
      status: "candidate",
      relatedClusterIds: [],
      evidence: { signalCount }
    });
  }

  return [...savedSuggestions, ...derived];
}

function buildEfficiencyOpportunities(clusters, questions, suggestions, config) {
  const minFaqHitCount = config.skills?.minFaqHitCount || 3;
  const skillCandidatesEnabled = config.skills?.candidateGenerationEnabled !== false && config.skills?.enabled !== false;
  const frequent = skillCandidatesEnabled
    ? clusters.filter((cluster) => cluster.questionCount >= minFaqHitCount).slice(0, 20)
    : [];
  const opportunities = frequent.map((cluster) => ({
    type: cluster.categoryL1 === "code_logic" ? "skill" : "faq",
    title: cluster.categoryL1 === "code_logic" ? `沉淀 Skill：${cluster.title}` : `沉淀 FAQ：${cluster.title}`,
    description: cluster.categoryL1 === "code_logic"
      ? "该类问题适合沉淀为可复用的只读分析 Skill，减少重复解释。"
      : "该问题重复出现，适合沉淀为 FAQ 直达或历史答案复用。",
    relatedClusterIds: [cluster.clusterId],
    questionCount: cluster.questionCount,
    priorityHint: cluster.questionCount >= 5 ? "P1" : "P2"
  }));

  if (suggestions.length > 0) {
    opportunities.push({
      type: "workflow",
      title: "建立建议处理闭环",
      description: "已有改进建议需要状态流转，适合在平台内形成追踪闭环。",
      relatedClusterIds: [],
      questionCount: suggestions.length,
      priorityHint: "P2"
    });
  }

  const noAnswerCount = questions.filter((question) => question.answerStatus === "no_answer").length;

  if (noAnswerCount > 0) {
    opportunities.push({
      type: "knowledge",
      title: "优先补齐 no_answer 问题资料",
      description: "本周期存在无答案问题，补齐资料可直接提升知识命中率。",
      relatedClusterIds: [],
      questionCount: noAnswerCount,
      priorityHint: noAnswerCount >= 5 ? "P1" : "P2"
    });
  }

  return opportunities;
}

function suggestActionForCluster(cluster, latest) {
  if (cluster.questionCount >= 3 && cluster.categoryL1 === "knowledge_gap") {
    return "补充知识库并沉淀 FAQ";
  }
  if (cluster.questionCount >= 3 && cluster.categoryL1 === "code_logic") {
    return "沉淀只读分析 Skill";
  }
  if (latest?.answerStatus === "no_answer") {
    return "补充资料或核验版本知识源";
  }
  if (cluster.questionCount >= 3) {
    return "沉淀 FAQ 或快捷入口";
  }
  return "持续观察";
}

function buildVersionMap(versionRegistry) {
  return new Map(versionRegistry.listPublicVersions().map((version) => [version.id, version]));
}

function isFailure(question) {
  return ["error", "timeout", "cancelled"].includes(question.answerStatus);
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) {
    return 0;
  }
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function rate(part, total) {
  if (!total) {
    return 0;
  }
  return Number(((part / total) * 100).toFixed(1));
}
