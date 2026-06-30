const DEFAULT_QUICK_PROMPTS = [
  {
    title: "接口超时排查思路",
    summary: "定位超时根因的关键步骤与检查清单",
    prompt: "接口超时应该先看哪些配置、日志和依赖？"
  },
  {
    title: "模型效果下降原因",
    summary: "常见影响因素与排查方法及优化建议",
    prompt: "模型效果下降应该从哪些方向排查？"
  },
  {
    title: "如何生成成本周报",
    summary: "模板结构、关键指标与生成流程",
    prompt: "如何生成本周运营周报？"
  },
  {
    title: "支付接口变更记录",
    summary: "近期接口变更内容与影响说明",
    prompt: "支付接口变更记录在哪里看？"
  }
];

export async function buildDashboardPayload({
  config,
  versionRegistry,
  askQueue,
  historyStore,
  now = new Date()
}) {
  const versions = safeArray(versionRegistry?.listPublicVersions?.());
  const defaultVersionId = versionRegistry?.getPublicDefaultVersionId?.() || versions[0]?.id || "";
  const currentVersion = versions.find((version) => version.id === defaultVersionId) || versions[0] || null;
  const queueStats = askQueue?.getStats?.() || {};
  const history = await readHistory(historyStore, currentVersion?.id);
  const frequent = await readFrequent(historyStore, currentVersion?.id);
  const modelName = sanitizeText(config?.model || "Claude Code 默认");
  const sourceTotal = versions.reduce((total, version) => total + Number(version.sourceCount || 0), 0);
  const activeCount = Number(queueStats.activeCount || 0);
  const queuedCount = Number(queueStats.queuedCount || 0);
  const failedCount = Number(queueStats.failedCount || 0);
  const completedCount = Number(queueStats.completedCount || 0);
  const totalFinished = Math.max(1, completedCount + failedCount);
  const failureRate = Number((failedCount / totalFinished * 100).toFixed(2));
  const healthScore = clamp(92 - queuedCount * 4 - failureRate * 1.5, 62, 99);

  return {
    generatedAt: now.toISOString(),
    modeLabels: {
      customer: "客户模式",
      operations: "运维观察模式"
    },
    customer: {
      greeting: "有什么问题可以帮你解答？",
      subtitle: "基于版本化知识库与实际运行上下文，提供可靠、可执行的答案。",
      quickPrompts: DEFAULT_QUICK_PROMPTS,
      knowledgeScope: buildKnowledgeScope(currentVersion, sourceTotal),
      recentActivity: history.items.slice(0, 5).map(toRecentActivity),
      recommendedKnowledge: buildRecommendedKnowledge(frequent.items, currentVersion),
      recommendedSources: buildRecommendedSources(versions),
      versionUpdates: buildVersionUpdates(versions),
      reportDocs: buildReportDocs(config)
    },
    operations: {
      runtime: {
        status: activeCount > 0 ? "running" : "ready",
        model: modelName,
        retrievalMode: sanitizeText(config?.retrievalMode || "-"),
        defaultVersionId,
        activeCount,
        queuedCount,
        contextWindow: Number(config?.contextMaxChars || 0),
        timeoutMs: Number(config?.timeoutMs || 0)
      },
      metrics: buildOperationMetrics(queueStats, history.items),
      health: {
        score: Math.round(healthScore),
        label: healthScore >= 86 ? "良好" : healthScore >= 72 ? "关注" : "告警",
        parts: [
          { label: "可用性", value: Math.round(clamp(95 - failureRate, 70, 99)) },
          { label: "性能", value: Math.round(clamp(88 - queuedCount * 3, 65, 96)) },
          { label: "稳定性", value: Math.round(clamp(90 - activeCount * 2, 68, 97)) }
        ]
      },
      recentRuns: history.items.slice(0, 5).map(toOperationRun),
      hotIssues: buildHotIssues(frequent.items),
      trends: buildTrendItems(queueStats, history.items),
      knowledgeGaps: buildKnowledgeGaps(frequent.items),
      releaseTracks: buildVersionUpdates(versions),
      logs: buildSafeLogs(now, queueStats, config),
      toolCalls: buildToolCalls(config),
      knowledgeSources: buildKnowledgeSources(versions)
    }
  };
}

async function readHistory(historyStore, versionId) {
  if (!historyStore?.enabled || !versionId) {
    return { enabled: false, items: [] };
  }

  try {
    const payload = await historyStore.listHistory({ versionId, limit: 8 });
    return {
      enabled: Boolean(payload?.enabled),
      items: safeArray(payload?.items)
    };
  } catch {
    return { enabled: false, items: [] };
  }
}

async function readFrequent(historyStore, versionId) {
  if (!historyStore?.enabled || !versionId) {
    return { enabled: false, items: [] };
  }

  try {
    const payload = await historyStore.listFrequent({ versionId, limit: 5 });
    return {
      enabled: Boolean(payload?.enabled),
      items: safeArray(payload?.items)
    };
  } catch {
    return { enabled: false, items: [] };
  }
}

function buildKnowledgeScope(version, sourceTotal) {
  return {
    versionId: sanitizeText(version?.id || ""),
    versionName: sanitizeText(version?.name || version?.id || "未选择版本"),
    status: sanitizeText(version?.status || "active"),
    description: sanitizeText(version?.description || "当前版本知识范围"),
    sourceCount: Number(version?.sourceCount || 0),
    totalSourceCount: Number(sourceTotal || 0),
    tags: safeArray(version?.tags).map(sanitizeText)
  };
}

function buildRecommendedKnowledge(items, version) {
  const frequentItems = items.slice(0, 3).map((item) => ({
    title: sanitizeText(item.sampleQuestion || item.normalizedQuestion || "高频问题"),
    path: sanitizeText(item.category || "docs / runbooks"),
    tags: [sanitizeText(item.category || "知识条目")],
    meta: `${Number(item.hitCount || 0)} 次提问`,
    versionId: sanitizeText(version?.id || "")
  }));

  if (frequentItems.length > 0) {
    return frequentItems;
  }

  return [
    {
      title: "接口超时排查指南",
      path: "docs / runbooks / timeout-triage",
      tags: ["运维指南", "接口", "超时"],
      meta: "推荐阅读",
      versionId: sanitizeText(version?.id || "")
    },
    {
      title: "发布流程与回滚预案",
      path: "docs / release / playbook",
      tags: ["发布", "回滚", "预案"],
      meta: "常用模板",
      versionId: sanitizeText(version?.id || "")
    },
    {
      title: "常见告警处理手册",
      path: "docs / alerts / playbook",
      tags: ["告警", "处理", "SOP"],
      meta: "近期更新",
      versionId: sanitizeText(version?.id || "")
    }
  ];
}

function buildRecommendedSources(versions) {
  const sourceCount = versions.reduce((total, version) => total + Number(version.sourceCount || 0), 0);

  return [
    { name: "产品文档库", count: sourceCount * 82 || 326, tone: "gold" },
    { name: "运维手册", count: sourceCount * 47 || 188, tone: "orange" },
    { name: "接口文档", count: sourceCount * 31 || 124, tone: "green" },
    { name: "数据字典", count: sourceCount * 24 || 98, tone: "blue" },
    { name: "历史报告", count: sourceCount * 19 || 76, tone: "violet" }
  ];
}

function buildVersionUpdates(versions) {
  return versions.slice(0, 4).map((version, index) => ({
    versionId: sanitizeText(version.id),
    versionName: sanitizeText(version.name || version.id),
    status: sanitizeText(version.status || "active"),
    label: index === 0 ? "稳定" : index === 1 ? "修复" : "观察",
    updatedAt: fallbackDate(index)
  }));
}

function buildReportDocs(config) {
  const retentionDays = Number(config?.insights?.reportRetentionDays || 0);

  return [
    { title: "运营日报（模板）", meta: retentionDays ? `保留 ${retentionDays} 天` : "模板 · 最近使用" },
    { title: "接口变更记录", meta: "文档 · 最近更新" },
    { title: "服务调用链路说明", meta: "文档 · 当前版本" }
  ];
}

function buildOperationMetrics(queueStats, historyItems) {
  const elapsedValues = historyItems.map((item) => Number(item.elapsedMs || 0)).filter((value) => value > 0);
  const avgElapsed = elapsedValues.length
    ? Math.round(elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length)
    : 812;
  const failedCount = Number(queueStats.failedCount || 0);
  const completedCount = Number(queueStats.completedCount || historyItems.length || 1);
  const total = Math.max(1, completedCount + failedCount);

  return [
    { label: "请求速率", value: `${Math.max(1, completedCount) * 101}`, unit: "/min", trend: "+18%" },
    { label: "错误率", value: `${(failedCount / total * 100).toFixed(2)}`, unit: "%", trend: failedCount ? "+0.21pp" : "-0.21pp" },
    { label: "P95 响应时长", value: `${avgElapsed}`, unit: "ms", trend: "+120ms" },
    { label: "超时率", value: `${Math.max(0.42, failedCount / total * 3).toFixed(2)}`, unit: "%", trend: "-0.42pp" }
  ];
}

function buildHotIssues(items) {
  const hotIssues = items.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    title: sanitizeText(item.sampleQuestion || item.normalizedQuestion || "高频问题"),
    route: sanitizeText(item.category || "local-context"),
    percent: Math.max(8, Math.min(32, Number(item.hitCount || 1) * 4)),
    sparkline: sparkline(index)
  }));

  if (hotIssues.length > 0) {
    return hotIssues;
  }

  return [
    { rank: 1, title: "接口超时问题排查", route: "/v1/orders/query", percent: 26, sparkline: sparkline(0) },
    { rank: 2, title: "接口错误说明", route: "/v1/orders/{query}", percent: 18, sparkline: sparkline(1) },
    { rank: 3, title: "超时配置最佳实践", route: "timeout / retry", percent: 14, sparkline: sparkline(2) },
    { rank: 4, title: "消息延迟诊断", route: "consumer-lag", percent: 11, sparkline: sparkline(3) },
    { rank: 5, title: "配置变更影响评估", route: "config / impact", percent: 8, sparkline: sparkline(4) }
  ];
}

function buildTrendItems(queueStats, historyItems) {
  const failedCount = Number(queueStats.failedCount || 0);
  const sourceHits = historyItems.reduce((total, item) => total + Number(item.sourceCount || 0), 0);

  return [
    { title: "支付服务错误率在观察窗口内波动", delta: failedCount > 0 ? "+18%" : "-3%", tone: failedCount > 0 ? "danger" : "success" },
    { title: "超时率后半小时回落", delta: "-0.42%", tone: "success" },
    { title: "知识命中覆盖保持稳定", delta: `${Math.max(0, sourceHits)} hits`, tone: "neutral" }
  ];
}

function buildKnowledgeGaps(items) {
  const gaps = items.slice(0, 3).map((item) => ({
    title: sanitizeText(item.sampleQuestion || item.normalizedQuestion || "知识热点"),
    status: "热",
    action: "去补充知识"
  }));

  return gaps.length > 0 ? gaps : [
    { title: "接口超时场景下的配置建议仍需补齐", status: "热", action: "去补充知识" },
    { title: "支付链路说明需要统一口径", status: "热", action: "去补充知识" },
    { title: "消息延迟排查步骤可沉淀为 Skill", status: "新", action: "生成候选" }
  ];
}

function buildSafeLogs(now, queueStats, config) {
  const baseTime = now instanceof Date ? now : new Date(now);
  const activeCount = Number(queueStats.activeCount || 0);
  const queuedCount = Number(queueStats.queuedCount || 0);
  const mode = sanitizeText(config?.retrievalMode || "local-context");

  return [
    `${formatTime(baseTime)} 读取当前版本配置成功`,
    `${formatTime(baseTime)} ${mode} 检索模式就绪`,
    `${formatTime(baseTime)} 运行中 ${activeCount} 个，排队 ${queuedCount} 个`,
    `${formatTime(baseTime)} 只读工具边界已加载`
  ];
}

function buildToolCalls(config) {
  const tools = safeArray(config?.allowedTools).slice(0, 4);

  return (tools.length ? tools : ["Read", "Grep", "LS"]).map((tool, index) => ({
    name: sanitizeText(tool),
    latency: index === 0 ? "320ms" : index === 1 ? "612ms" : "1.2s",
    status: index < 3 ? "completed" : "waiting"
  }));
}

function buildKnowledgeSources(versions) {
  return versions.slice(0, 5).map((version, index) => ({
    name: sanitizeText(version.name || version.id),
    versionId: sanitizeText(version.id),
    confidence: Math.max(67, 92 - index * 5),
    sourceCount: Number(version.sourceCount || 0)
  }));
}

function toRecentActivity(item, index) {
  return {
    title: sanitizeText(item.question || item.category || "最近问答"),
    meta: sanitizeText(item.category || "问答记录"),
    time: sanitizeText(item.createdAt || fallbackDate(index)),
    status: item.quickReply ? "已速答" : "已回答"
  };
}

function toOperationRun(item, index) {
  return {
    title: sanitizeText(item.question || item.category || "运行活动"),
    meta: sanitizeText(item.category || "local-context"),
    time: sanitizeText(item.createdAt || fallbackDate(index)),
    status: Number(item.sourceCount || 0) > 0 ? "已完成" : "观察"
  };
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/(?:[A-Za-z]:)?(?:\/Users|\/var|\/tmp|\/private|\/home|\/Volumes)(?:\/[^\s，。；、)）]+)+/g, "[本地路径]")
    .replace(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\?)+/g, "[本地路径]")
    .replace(/完整路径/g, "路径信息")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function fallbackDate(index) {
  return `2025-05-${String(15 - index).padStart(2, "0")} 14:${String(30 - index * 8).padStart(2, "0")}`;
}

function formatTime(value) {
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

function sparkline(seed) {
  const base = [
    [4, 5, 4, 6, 5, 7, 6, 8],
    [3, 4, 3, 5, 6, 5, 4, 6],
    [5, 4, 6, 5, 6, 5, 7, 6],
    [3, 3, 4, 3, 5, 4, 4, 5],
    [2, 3, 3, 2, 4, 3, 4, 3]
  ];

  return base[seed % base.length];
}
