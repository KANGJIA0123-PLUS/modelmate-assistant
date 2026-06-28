import {
  fetchEfficiencyOpportunities,
  fetchImprovementSuggestions,
  fetchInsightCategories,
  fetchInsightFrequentQuestions,
  fetchInsightOverview,
  fetchInsightVersions,
  fetchKnowledgeGaps,
  updateImprovementSuggestion
} from "./api.js";

export function createInsightsUi({ dom, state, reportsUi, helpers }) {
  return {
    updateAppView,
    updateInsightsPageTabs,
    updateInsightsRangeControls,
    loadInsightsPage,
    handleInsightsAction
  };

  function updateAppView() {
    const isInsights = state.selectedAppView === "insights";

    dom.appViewButtons.forEach((button) => {
      const active = button.dataset.appView === state.selectedAppView;
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    dom.chatView.hidden = isInsights;
    dom.insightsView.hidden = !isInsights;
    dom.chatView.classList.toggle("active-view", !isInsights);
    dom.insightsView.classList.toggle("active-view", isInsights);

    if (!isInsights) {
      reportsUi.clearReportJobListPolling();
    }

    if (isInsights) {
      updateInsightsRangeControls();
      void loadInsightsPage();
    }
  }

  function updateInsightsPageTabs() {
    dom.insightsPageButtons.forEach((button) => {
      const active = button.dataset.insightsPage === state.selectedInsightsPage;
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function updateInsightsRangeControls() {
    const isCustom = dom.insightsRangeSelect?.value === "custom";

    if (dom.insightsStart && dom.insightsEnd) {
      dom.insightsStart.hidden = !isCustom;
      dom.insightsEnd.hidden = !isCustom;
    }

    if (dom.insightsRangeLabel) {
      const version = helpers.getSelectedVersion();
      dom.insightsRangeLabel.textContent = `${formatInsightsRangeLabel()} · ${version?.name || "全部版本"}`;
    }
  }

  async function loadInsightsPage() {
    if (!dom.insightsPageContent || state.selectedAppView !== "insights") {
      return;
    }

    if (state.selectedInsightsPage !== "reports") {
      reportsUi.clearReportJobListPolling();
    }

    updateInsightsPageTabs();
    updateInsightsRangeControls();
    dom.insightsPageContent.innerHTML = `<p class="insight-empty">正在加载...</p>`;

    try {
      if (state.selectedInsightsPage === "overview") {
        await renderInsightsOverviewPage();
      } else if (state.selectedInsightsPage === "reports") {
        await reportsUi.renderReportsPage();
      } else {
        await renderInsightListPage(state.selectedInsightsPage);
      }
    } catch (error) {
      dom.insightsPageContent.innerHTML = `<p class="insight-empty">${helpers.escapeHtml(error.message || String(error))}</p>`;
    }
  }

  async function handleInsightsAction(action) {
    const actionName = action.dataset.insightsAction;

    if (actionName === "generate-report") {
      await reportsUi.generateInsightReport(action.dataset.reportType || "weekly");
    }

    if (actionName === "open-report") {
      await reportsUi.openInsightReport(action.dataset.reportId || "");
    }

    if (actionName === "copy-report") {
      await reportsUi.copyReportMarkdown();
    }

    if (actionName === "download-report-md") {
      reportsUi.downloadReportMarkdown();
    }

    if (actionName === "print-report-pdf") {
      reportsUi.printReportPdf();
    }

    if (actionName === "update-suggestion") {
      await updateSuggestionStatus(action.dataset.suggestionId || "", action.dataset.status || "open");
    }
  }

  async function renderInsightsOverviewPage() {
    const query = buildInsightsQueryParams();
    const [overview, frequent, categories, versionsPayload] = await Promise.all([
      fetchInsightOverview(query),
      fetchInsightFrequentQuestions({ ...query, limit: 5 }),
      fetchInsightCategories(query),
      fetchInsightVersions(query)
    ]);
    const metrics = overview.metrics || {};

    dom.insightsPageContent.innerHTML = `
      <div class="metric-grid">
        ${renderMetricCard("总问题", metrics.totalQuestions || 0, "问")}
        ${renderMetricCard("知识命中率", `${metrics.knowledgeHitRate || 0}%`, "")}
        ${renderMetricCard("资料不足率", `${metrics.knowledgeGapRate || 0}%`, "")}
        ${renderMetricCard("重复问题率", `${metrics.repetitionRate || 0}%`, "")}
        ${renderMetricCard("平均响应", helpers.formatDurationMs(metrics.avgElapsedMs || 0), "")}
        ${renderMetricCard("提效机会", metrics.aiOpportunityCount || 0, "项")}
      </div>
      <div class="insights-grid">
        ${renderPanel("高频问题", renderSimpleList(frequent.items, (item) => `${item.title} · ${item.questionCount} 次`))}
        ${renderPanel("分类分布", renderSimpleList(categories.items, (item) => `${item.categoryL1Name} / ${item.categoryL2Name} · ${item.questionCount} 问`))}
        ${renderPanel("版本分布", renderSimpleList(versionsPayload.items, (item) => `${item.versionName} · ${item.questionCount} 问`))}
      </div>
    `;
  }

  async function renderInsightListPage(page) {
    const payload = await loadInsightListPayload(page);

    if (!payload) {
      dom.insightsPageContent.innerHTML = `<p class="insight-empty">暂无数据。</p>`;
      return;
    }

    const items = Array.isArray(payload.items) ? payload.items : [];

    if (page === "frequent") {
      dom.insightsPageContent.innerHTML = renderDataTable(["问题簇", "次数", "分类", "版本", "建议动作"], items.map((item) => [
        item.title,
        item.questionCount,
        item.categoryL1Name || item.categoryL1,
        item.versionId,
        item.suggestedAction
      ]));
      return;
    }

    if (page === "categories") {
      dom.insightsPageContent.innerHTML = renderDataTable(["一级分类", "二级分类", "问题数", "占比", "资料缺口"], items.map((item) => [
        item.categoryL1Name,
        item.categoryL2Name,
        item.questionCount,
        `${item.percent || 0}%`,
        item.knowledgeGapCount || 0
      ]));
      return;
    }

    if (page === "versions") {
      dom.insightsPageContent.innerHTML = renderDataTable(["版本", "问题数", "资料不足率", "失败率", "平均耗时"], items.map((item) => [
        item.versionName,
        item.questionCount,
        `${item.knowledgeGapRate || 0}%`,
        `${item.failureRate || 0}%`,
        helpers.formatDurationMs(item.avgElapsedMs || 0)
      ]));
      return;
    }

    if (page === "gaps") {
      dom.insightsPageContent.innerHTML = renderCardList(items, (item) => `
        <strong>${helpers.escapeHtml(item.title || "未命名缺口")}</strong>
        <span>${helpers.escapeHtml(`${item.reason || "来源不足"} · ${item.questionCount || 1} 次 · ${helpers.formatRelativeTime(item.lastSeenAt)}`)}</span>
      `);
      return;
    }

    if (page === "suggestions") {
      dom.insightsPageContent.innerHTML = renderSuggestionCards(items);
      return;
    }

    if (page === "efficiency") {
      dom.insightsPageContent.innerHTML = renderCardList(items, (item) => `
        <strong>${helpers.escapeHtml(`${item.priorityHint || "P2"} · ${item.title || "未命名机会"}`)}</strong>
        <span>${helpers.escapeHtml(`${item.type || "opportunity"} · ${item.description || ""}`)}</span>
      `);
    }
  }

  function loadInsightListPayload(page) {
    const query = buildInsightsQueryParams();

    if (page === "frequent") {
      return fetchInsightFrequentQuestions(query);
    }

    if (page === "categories") {
      return fetchInsightCategories(query);
    }

    if (page === "versions") {
      return fetchInsightVersions(query);
    }

    if (page === "gaps") {
      return fetchKnowledgeGaps(query);
    }

    if (page === "suggestions") {
      return fetchImprovementSuggestions({ status: "all", limit: 100 });
    }

    if (page === "efficiency") {
      return fetchEfficiencyOpportunities(query);
    }

    return null;
  }

  async function updateSuggestionStatus(id, status) {
    if (!id) {
      return;
    }

    await updateImprovementSuggestion(id, { status });
    await renderInsightListPage("suggestions");
  }

  function buildInsightsQueryParams(extra = {}) {
    const range = dom.insightsRangeSelect?.value || "7d";
    const params = {
      versionId: state.selectedVersionId || "all",
      ...extra
    };

    if (range === "custom") {
      params.range = "custom";

      if (dom.insightsStart?.value) {
        params.start = dom.insightsStart.value;
      }

      if (dom.insightsEnd?.value) {
        params.end = dom.insightsEnd.value;
      }
    } else {
      params.range = range;
    }

    return params;
  }

  function formatInsightsRangeLabel() {
    const range = dom.insightsRangeSelect?.value || "7d";

    if (range === "30d") {
      return "最近 30 天";
    }

    if (range === "custom") {
      return "自定义范围";
    }

    return "最近 7 天";
  }

  function renderMetricCard(label, value, suffix) {
    return `
      <div class="metric-card">
        <span>${helpers.escapeHtml(label)}</span>
        <strong>${helpers.escapeHtml(value)}${suffix ? `<small>${helpers.escapeHtml(suffix)}</small>` : ""}</strong>
      </div>
    `;
  }

  function renderPanel(title, content) {
    return `
      <section class="insights-panel">
        <h4>${helpers.escapeHtml(title)}</h4>
        ${content}
      </section>
    `;
  }

  function renderSimpleList(items, formatter) {
    if (!Array.isArray(items) || items.length === 0) {
      return `<p class="insight-empty">暂无数据。</p>`;
    }

    return `<ul class="compact-list">${items.map((item) => `<li>${helpers.escapeHtml(formatter(item))}</li>`).join("")}</ul>`;
  }

  function renderDataTable(headers, rows) {
    if (!rows.length) {
      return `<p class="insight-empty">暂无数据。</p>`;
    }

    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>${headers.map((header) => `<th>${helpers.escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>${row.map((cell) => `<td>${helpers.escapeHtml(cell ?? "-")}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderCardList(items, renderer) {
    if (!Array.isArray(items) || items.length === 0) {
      return `<p class="insight-empty">暂无数据。</p>`;
    }

    return `<div class="insight-card-list">${items.map((item) => `<article class="insight-detail-card">${renderer(item)}</article>`).join("")}</div>`;
  }

  function renderSuggestionCards(items) {
    if (!items.length) {
      return `<p class="insight-empty">暂无建议。</p>`;
    }

    return `<div class="insight-card-list">${items.map((item) => `
      <article class="insight-detail-card">
        <strong>${helpers.escapeHtml(`${item.priority || "P3"} · ${item.title || "未命名建议"}`)}</strong>
        <span>${helpers.escapeHtml(`${item.type || "platform"} · ${item.status || "open"} · 分数 ${item.priorityScore || 0}`)}</span>
        <p>${helpers.escapeHtml(item.description || "")}</p>
        <div class="suggestion-actions">
          <button type="button" data-insights-action="update-suggestion" data-suggestion-id="${helpers.escapeHtml(item.id)}" data-status="in_progress">进行中</button>
          <button type="button" data-insights-action="update-suggestion" data-suggestion-id="${helpers.escapeHtml(item.id)}" data-status="done">完成</button>
          <button type="button" data-insights-action="update-suggestion" data-suggestion-id="${helpers.escapeHtml(item.id)}" data-status="rejected">驳回</button>
        </div>
      </article>
    `).join("")}</div>`;
  }
}
