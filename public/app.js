import { fetchDashboard, fetchRuntimeConfig, fetchVersions } from "./api.js";
import { createChatStream } from "./chat-stream.js";
import { createInsightsUi } from "./insights-ui.js";
import { createReportsUi } from "./reports-ui.js";
import { createSessionStore } from "./sessions.js";

const dom = {
  form: document.querySelector("#ask-form"),
  questionInput: document.querySelector("#question"),
  conversation: document.querySelector("#conversation"),
  askButton: document.querySelector("#ask-button"),
  cancelButton: document.querySelector("#cancel-button"),
  clearButton: document.querySelector("#clear-button"),
  operatorInput: document.querySelector("#operator-input"),
  operatorStatus: document.querySelector("#operator-status"),
  versionSelect: document.querySelector("#version-select"),
  versionStatus: document.querySelector("#version-status"),
  versionDescription: document.querySelector("#version-description"),
  runtimeStatus: document.querySelector("#runtime-status"),
  sourceList: document.querySelector("#source-list"),
  modelName: document.querySelector("#model-name"),
  statusModel: document.querySelector("#status-model"),
  retrievalMode: document.querySelector("#retrieval-mode"),
  toolList: document.querySelector("#tool-list"),
  sourceCount: document.querySelector("#source-count"),
  contextWindow: document.querySelector("#context-window"),
  timeoutValue: document.querySelector("#timeout-value"),
  boundarySummary: document.querySelector("#boundary-summary"),
  warningList: document.querySelector("#warning-list"),
  flowStatus: document.querySelector("#flow-status"),
  sessionList: document.querySelector("#session-list"),
  sessionCount: document.querySelector("#session-count"),
  newSessionButton: document.querySelector("#new-session-button"),
  currentSessionName: document.querySelector("#current-session-name"),
  contextBadge: document.querySelector("#context-badge"),
  currentVersionBadge: document.querySelector("#current-version-badge"),
  capabilitySummary: document.querySelector("#capability-summary"),
  capabilityList: document.querySelector("#capability-list"),
  appViewButtons: document.querySelectorAll("[data-app-view]"),
  appModeButtons: document.querySelectorAll("[data-app-mode]"),
  chatView: document.querySelector("#chat-view"),
  operationsView: document.querySelector("#operations-observe"),
  insightsView: document.querySelector("#insights-view"),
  dashboardRefreshButton: document.querySelector("#dashboard-refresh-button"),
  knowledgeUpdatedAt: document.querySelector("#knowledge-updated-at"),
  operatorChip: document.querySelector("#operator-chip"),
  customerOperatorName: document.querySelector("#customer-operator-name"),
  opsOperatorName: document.querySelector("#ops-operator-name"),
  customerGreeting: document.querySelector("#customer-greeting"),
  customerSubtitle: document.querySelector("#customer-subtitle"),
  customerPromptList: document.querySelector("#customer-prompt-list"),
  customerActivityList: document.querySelector("#customer-activity-list"),
  customerKnowledgeList: document.querySelector("#customer-knowledge-list"),
  knowledgeScopeStatus: document.querySelector("#knowledge-scope-status"),
  knowledgeScopeTitle: document.querySelector("#knowledge-scope-title"),
  knowledgeScopeMeta: document.querySelector("#knowledge-scope-meta"),
  knowledgeItemCount: document.querySelector("#knowledge-item-count"),
  knowledgeVersionCount: document.querySelector("#knowledge-version-count"),
  knowledgeDomainCount: document.querySelector("#knowledge-domain-count"),
  customerSourceList: document.querySelector("#customer-source-list"),
  customerVersionList: document.querySelector("#customer-version-list"),
  customerReportList: document.querySelector("#customer-report-list"),
  opsMetricGrid: document.querySelector("#ops-metric-grid"),
  opsActivityList: document.querySelector("#ops-activity-list"),
  opsHotIssueList: document.querySelector("#ops-hot-issue-list"),
  opsTrendList: document.querySelector("#ops-trend-list"),
  opsGapList: document.querySelector("#ops-gap-list"),
  opsReleaseList: document.querySelector("#ops-release-list"),
  opsHealthScore: document.querySelector("#ops-health-score"),
  opsHealthLabel: document.querySelector("#ops-health-label"),
  opsHealthParts: document.querySelector("#ops-health-parts"),
  opsRuntimeState: document.querySelector("#ops-runtime-state"),
  opsLogList: document.querySelector("#ops-log-list"),
  opsToolCallList: document.querySelector("#ops-tool-call-list"),
  opsKnowledgeSourceList: document.querySelector("#ops-knowledge-source-list"),
  insightsRangeLabel: document.querySelector("#insights-range-label"),
  insightsRangeSelect: document.querySelector("#insights-range-select"),
  insightsStart: document.querySelector("#insights-start"),
  insightsEnd: document.querySelector("#insights-end"),
  refreshInsightsButton: document.querySelector("#refresh-insights-button"),
  insightsPageButtons: document.querySelectorAll("[data-insights-page]"),
  insightsPageContent: document.querySelector("#insights-page-content")
};

const SESSION_STORAGE_KEY = "modelmate.sessions.v1";
const CURRENT_SESSION_KEY = "modelmate.currentSessionId";
const VERSION_STORAGE_KEY = "modelmate.selectedVersionId";
const APP_MODE_STORAGE_KEY = "modelmate.selectedAppMode";
const MAX_SESSIONS = 30;
const MAX_STORED_MESSAGES = 80;
const DEFAULT_HISTORY_MESSAGES = 8;

const state = {
  runtimeConfig: null,
  dashboard: null,
  versions: [],
  selectedVersionId: window.localStorage.getItem(VERSION_STORAGE_KEY) || "",
  selectedAppMode: window.localStorage.getItem(APP_MODE_STORAGE_KEY) || "customer",
  selectedAppView: "chat",
  selectedInsightsPage: "overview",
  hasMessages: false,
  isSubmitting: false,
  isComposingQuestion: false,
  activeAskController: null
};

const sessionStore = createSessionStore({
  sessionStorageKey: SESSION_STORAGE_KEY,
  currentSessionKey: CURRENT_SESSION_KEY,
  maxSessions: MAX_SESSIONS,
  maxStoredMessages: MAX_STORED_MESSAGES
});

const helpers = {
  escapeHtml,
  formatDurationMs,
  formatRelativeTime,
  getSelectedVersion,
  updateMessage
};
const reportsUi = createReportsUi({ dom, state, helpers });
const insightsUi = createInsightsUi({ dom, state, reportsUi, helpers });
const chatStream = createChatStream({
  dom,
  state,
  helpers: {
    updateMessage
  }
});

dom.operatorInput.value = window.localStorage.getItem("modelmate.operator") || "";
updateOperatorStatus();
setAppMode(state.selectedAppMode);
await loadRuntimeConfig();
await loadDashboard();
renderSessionList();
renderCurrentSession();
bindEventHandlers();

function bindEventHandlers() {
  dom.operatorInput.addEventListener("input", () => {
    window.localStorage.setItem("modelmate.operator", dom.operatorInput.value.trim());
    updateOperatorStatus();
  });

  dom.versionSelect.addEventListener("change", () => {
    setSelectedVersion(dom.versionSelect.value, { persist: true });
    dom.flowStatus.textContent = state.selectedVersionId ? "待命" : "请选择版本";
  });

  dom.appModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setAppMode(button.dataset.appMode || "customer", { persist: true });
    });
  });

  dom.dashboardRefreshButton?.addEventListener("click", () => {
    void loadDashboard();
  });

  document.querySelectorAll("[data-dashboard-refresh]").forEach((button) => {
    button.addEventListener("click", () => {
      void loadDashboard();
    });
  });

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-focus-target]");

    if (!action) {
      return;
    }

    focusTarget(action.dataset.focusTarget || "");
  });

  dom.questionInput.addEventListener("compositionstart", () => {
    state.isComposingQuestion = true;
  });

  dom.questionInput.addEventListener("compositionend", () => {
    state.isComposingQuestion = false;
  });

  dom.questionInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || state.isComposingQuestion) {
      return;
    }

    event.preventDefault();

    if (!state.isSubmitting) {
      dom.form.requestSubmit();
    }
  });

  dom.appViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAppView = button.dataset.appView || "chat";
      insightsUi.updateAppView();
    });
  });

  dom.insightsPageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedInsightsPage = button.dataset.insightsPage || "overview";
      insightsUi.updateInsightsPageTabs();
      void insightsUi.loadInsightsPage();
    });
  });

  dom.insightsRangeSelect?.addEventListener("change", () => {
    insightsUi.updateInsightsRangeControls();
    void insightsUi.loadInsightsPage();
  });

  dom.insightsStart?.addEventListener("change", () => void insightsUi.loadInsightsPage());
  dom.insightsEnd?.addEventListener("change", () => void insightsUi.loadInsightsPage());
  dom.refreshInsightsButton?.addEventListener("click", () => insightsUi.loadInsightsPage());

  dom.cancelButton?.addEventListener("click", () => {
    if (!state.activeAskController) {
      return;
    }

    state.activeAskController.abort();
    dom.cancelButton.disabled = true;
    dom.flowStatus.textContent = "正在取消";
  });

  dom.insightsPageContent?.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-insights-action]");

    if (!action) {
      return;
    }

    await insightsUi.handleInsightsAction(action);
  });

  dom.newSessionButton.addEventListener("click", () => {
    setAppMode("customer", { persist: true });
    sessionStore.createAndSelectSession();
    renderSessionList();
    renderCurrentSession();
    dom.flowStatus.textContent = "待命";
    dom.questionInput.focus();
  });

  dom.clearButton.addEventListener("click", () => {
    setAppMode("customer", { persist: true });
    sessionStore.clearCurrentSession();
    renderSessionList();
    renderCurrentSession();
    dom.flowStatus.textContent = "待命";
  });

  dom.form.addEventListener("submit", handleAskSubmit);
  bindPromptButtons();
}

function setAppMode(mode, options = {}) {
  const nextMode = mode === "operations" ? "operations" : "customer";
  state.selectedAppMode = nextMode;
  document.body.dataset.mode = nextMode;

  if (options.persist) {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, nextMode);
  }

  dom.appModeButtons.forEach((button) => {
    const active = button.dataset.appMode === nextMode;
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.classList.toggle("active", active);
  });

  if (nextMode === "operations") {
    state.selectedAppView = "ops";
    dom.chatView.hidden = true;
    dom.operationsView.hidden = false;
    dom.insightsView.hidden = true;
    dom.chatView.classList.remove("active-view");
    dom.operationsView.classList.add("active-view");
    dom.insightsView.classList.remove("active-view");
    reportsUi.clearReportJobListPolling();
    return;
  }

  state.selectedAppView = "chat";
  dom.chatView.hidden = false;
  dom.operationsView.hidden = true;
  dom.insightsView.hidden = true;
  dom.chatView.classList.add("active-view");
  dom.operationsView.classList.remove("active-view");
  dom.insightsView.classList.remove("active-view");
  reportsUi.clearReportJobListPolling();
}

function focusTarget(targetId) {
  if (!targetId) {
    return;
  }

  const target = document.getElementById(targetId);

  if (!target) {
    return;
  }

  if (targetId === "question" || target.closest("#customer-home")) {
    setAppMode("customer", { persist: true });
  } else if (target.closest("#operations-observe") || target.closest(".operations-only")) {
    setAppMode("operations", { persist: true });
  }

  target.focus?.({ preventScroll: true });
  target.scrollIntoView?.({ behavior: "smooth", block: "center" });
}

async function handleAskSubmit(event) {
  event.preventDefault();

  if (state.isSubmitting) {
    return;
  }

  const question = dom.questionInput.value.trim();
  const version = getSelectedVersion();

  if (!version) {
    dom.flowStatus.textContent = "请先选择版本";
    dom.versionSelect.focus();
    return;
  }

  if (!question) {
    dom.questionInput.focus();
    return;
  }

  const operator = getOperator();
  const history = buildContextHistory();
  sessionStore.updateTitleFromQuestion(question);
  addMessageToCurrentSession({
    role: "user",
    sender: operator,
    content: question,
    meta: "",
    createdAt: new Date().toISOString()
  });
  appendMessage("user", operator, question);
  dom.questionInput.value = "";
  dom.askButton.disabled = true;
  dom.askButton.textContent = "处理中";
  dom.cancelButton.hidden = false;
  dom.cancelButton.disabled = false;
  state.isSubmitting = true;
  dom.flowStatus.textContent = "检索中";
  state.activeAskController = new AbortController();

  const pending = appendMessage("assistant", "助手", "正在检索本地资料...");
  const processPanel = chatStream.createProcessPanel(pending, { operator, question, historyCount: history.length, version });

  try {
    const payload = await chatStream.askStreaming({
      question,
      operator,
      history,
      versionId: version.id,
      message: pending,
      processPanel,
      signal: state.activeAskController.signal
    });
    addMessageToCurrentSession({
      role: "assistant",
      sender: "助手",
      content: payload?.answer || "没有返回内容。",
      meta: chatStream.formatMeta(payload || {}),
      createdAt: new Date().toISOString()
    });
    if (state.selectedAppView === "insights") {
      await insightsUi.loadInsightsPage();
    }
    dom.flowStatus.textContent = "待命";
  } catch (error) {
    pending.classList.add("error");
    chatStream.markProcessError(processPanel, error.message || String(error));
    updateMessage(pending, error.message || String(error));
    dom.flowStatus.textContent = error.message === "请求已取消。" ? "已取消" : "异常";
  } finally {
    state.activeAskController = null;
    state.isSubmitting = false;
    dom.cancelButton.hidden = true;
    dom.cancelButton.disabled = true;
    dom.askButton.disabled = !getSelectedVersion();
    dom.askButton.textContent = "发送";
    dom.questionInput.focus();
  }
}

async function loadRuntimeConfig() {
  try {
    const config = await fetchRuntimeConfig();
    state.runtimeConfig = config;

    dom.runtimeStatus.textContent = `运行于 ${config.host}:${config.port}`;
    dom.runtimeStatus.innerHTML = `<span class="signal-dot"></span><span>${escapeHtml(`运行于 ${config.host}:${config.port}`)}</span>`;
    dom.modelName.textContent = config.displayModel || config.model || "Claude Code 默认";
    dom.statusModel.textContent = config.displayModel || config.model || "Claude Code 默认";
    dom.retrievalMode.textContent = config.retrievalMode || "-";
    dom.toolList.textContent = config.allowedTools?.join(", ") || "-";
    dom.contextWindow.textContent = [
      config.contextMaxChars ? `${config.contextMaxChars} chars` : "",
      config.historyMaxMessages ? `${config.historyMaxMessages} turns` : ""
    ].filter(Boolean).join(" / ") || "-";
    dom.timeoutValue.textContent = config.timeoutMs ? `${Math.round(config.timeoutMs / 1000)}s` : "-";
    dom.boundarySummary.textContent = formatBoundarySummary(config);
    renderCapabilityStatus(config);
    updateSessionHeader();
    await loadVersions(config.defaultVersionId);

    if (config.warnings?.length) {
      dom.warningList.hidden = false;
      dom.warningList.textContent = config.warnings.join("\n");
    }
  } catch (error) {
    dom.runtimeStatus.textContent = "连接失败";
    dom.boundarySummary.textContent = "配置未加载";
    renderCapabilityStatus(null);
    dom.warningList.hidden = false;
    dom.warningList.textContent = error.message || String(error);
    updateSelectedVersionUI();
  }
}

async function loadDashboard() {
  dom.dashboardRefreshButton.disabled = true;

  try {
    const payload = await fetchDashboard();
    state.dashboard = payload;
    renderDashboard(payload);
  } catch (error) {
    if (dom.knowledgeUpdatedAt) {
      dom.knowledgeUpdatedAt.textContent = "知识库状态未知";
    }

    if (dom.warningList) {
      dom.warningList.hidden = false;
      dom.warningList.textContent = error.message || String(error);
    }
  } finally {
    dom.dashboardRefreshButton.disabled = false;
  }
}

function renderDashboard(payload) {
  if (!payload) {
    return;
  }

  if (dom.knowledgeUpdatedAt) {
    dom.knowledgeUpdatedAt.textContent = `知识库更新于 ${formatRelativeTime(payload.generatedAt)}`;
  }

  renderCustomerDashboard(payload.customer || {});
  renderOperationsDashboard(payload.operations || {});
  bindPromptButtons();
}

function renderCustomerDashboard(customer) {
  setText(dom.customerGreeting, customer.greeting || "有什么问题可以帮你解答？");
  setText(dom.customerSubtitle, customer.subtitle || "基于版本化知识库与实际运行上下文，提供可靠、可执行的答案。");
  renderCustomerPrompts(customer.quickPrompts || []);
  renderCustomerKnowledgeScope(customer.knowledgeScope || null);
  renderCompactList(dom.customerActivityList, customer.recentActivity || []);
  renderKnowledgeCards(dom.customerKnowledgeList, customer.recommendedKnowledge || []);
  renderSourcePills(dom.customerSourceList, customer.recommendedSources || []);
  renderCompactList(dom.customerVersionList, customer.versionUpdates || [], renderVersionRow);
  renderCompactList(dom.customerReportList, customer.reportDocs || []);
}

function renderOperationsDashboard(operations) {
  renderOperationMetrics(operations.metrics || []);
  setText(dom.opsHealthScore, operations.health?.score ?? "82");
  setText(dom.opsHealthLabel, operations.health?.label || "良好");
  setText(dom.opsRuntimeState, operations.runtime?.status === "running" ? "运行中" : "就绪");
  renderHealthParts(operations.health?.parts || []);
  renderCompactList(dom.opsActivityList, operations.recentRuns || []);
  renderHotIssues(operations.hotIssues || []);
  renderCompactList(dom.opsTrendList, operations.trends || [], renderTrendRow);
  renderCompactList(dom.opsGapList, operations.knowledgeGaps || [], renderGapRow);
  renderCompactList(dom.opsReleaseList, operations.releaseTracks || [], renderVersionRow);
  renderLogs(operations.logs || []);
  renderCompactList(dom.opsToolCallList, operations.toolCalls || [], renderToolCallRow);
  renderCompactList(dom.opsKnowledgeSourceList, operations.knowledgeSources || [], renderKnowledgeSourceRow);
}

function renderCustomerPrompts(items) {
  if (!dom.customerPromptList) {
    return;
  }

  const prompts = items.length ? items : buildDefaultPromptCards();
  dom.customerPromptList.innerHTML = prompts.map((item) => `
    <button type="button" data-prompt="${escapeHtml(item.prompt || item.title || "")}">
      <span>${escapeHtml(item.summary || "推荐提问")}</span>
      <strong>${escapeHtml(item.title || "知识入口")}</strong>
    </button>
  `).join("");
}

function renderCustomerKnowledgeScope(scope) {
  const selected = getSelectedVersion();
  const title = selected?.name || scope?.versionName || scope?.versionId || "未选择版本";
  const status = selected?.status || scope?.status || "active";
  const description = selected?.description || scope?.description || "当前版本知识范围";
  const sourceCount = Number(selected?.sourceCount || scope?.sourceCount || 0);

  setText(dom.knowledgeScopeTitle, title);
  setText(dom.knowledgeScopeStatus, status);
  setText(dom.knowledgeScopeMeta, description);
  setText(dom.knowledgeItemCount, String(Math.max(sourceCount * 128, sourceCount)));
  setText(dom.knowledgeVersionCount, String(state.versions.length));
  setText(dom.knowledgeDomainCount, String(Math.max(1, Math.min(12, sourceCount || state.versions.length))));
}

function renderKnowledgeCards(container, items) {
  if (!container) {
    return;
  }

  container.innerHTML = (items.length ? items : []).map((item) => `
    <article class="knowledge-card">
      <div>
        <strong>${escapeHtml(item.title || "知识条目")}</strong>
        <span>${escapeHtml(item.path || item.meta || "docs / runbooks")}</span>
      </div>
      <p>${escapeHtml(Array.isArray(item.tags) ? item.tags.join(" · ") : item.meta || "推荐阅读")}</p>
    </article>
  `).join("") || `<p class="insight-empty">暂无推荐知识。</p>`;
}

function renderSourcePills(container, items) {
  if (!container) {
    return;
  }

  container.innerHTML = (items.length ? items : []).map((item) => `
    <div class="source-pill" data-tone="${escapeHtml(item.tone || "green")}">
      <span>${escapeHtml(item.name || "知识来源")}</span>
      <strong>${escapeHtml(item.count || 0)}</strong>
    </div>
  `).join("") || `<p class="insight-empty">暂无来源。</p>`;
}

function renderOperationMetrics(items) {
  if (!dom.opsMetricGrid) {
    return;
  }

  dom.opsMetricGrid.innerHTML = items.map((item) => `
    <article class="metric-card">
      <span>${escapeHtml(item.label || "指标")}</span>
      <strong>${escapeHtml(item.value || "0")}<small>${escapeHtml(item.unit || "")}</small></strong>
      <p>${escapeHtml(item.trend || "0")} vs 1 小时前</p>
      <div class="mini-sparkline" aria-hidden="true">
        ${renderSparkline([3, 5, 4, 6, 5, 7, 6, 8])}
      </div>
    </article>
  `).join("");
}

function renderHealthParts(items) {
  if (!dom.opsHealthParts) {
    return;
  }

  dom.opsHealthParts.innerHTML = items.map((item) => `
    <div class="health-part">
      <span>${escapeHtml(item.label || "指标")}</span>
      <strong>${escapeHtml(item.value || 0)}</strong>
    </div>
  `).join("");
}

function renderHotIssues(items) {
  if (!dom.opsHotIssueList) {
    return;
  }

  dom.opsHotIssueList.innerHTML = items.map((item) => `
    <article class="hot-issue">
      <span class="rank-badge">${escapeHtml(item.rank || 0)}</span>
      <div>
        <strong>${escapeHtml(item.title || "热点问题")}</strong>
        <p>${escapeHtml(item.route || "local-context")}</p>
      </div>
      <span>${escapeHtml(item.percent || 0)}%</span>
      <div class="mini-sparkline" aria-hidden="true">${renderSparkline(item.sparkline || [])}</div>
    </article>
  `).join("");
}

function renderLogs(items) {
  if (!dom.opsLogList) {
    return;
  }

  dom.opsLogList.innerHTML = items.map((item) => `
    <code>${escapeHtml(item)}</code>
  `).join("") || `<p class="insight-empty">暂无日志。</p>`;
}

function renderCompactList(container, items, rowRenderer = renderListRow) {
  if (!container) {
    return;
  }

  container.innerHTML = (items.length ? items : []).map(rowRenderer).join("") || `<p class="insight-empty">暂无数据。</p>`;
}

function renderListRow(item) {
  return `
    <article class="compact-row">
      <div>
        <strong>${escapeHtml(item.title || item.versionName || item.name || "条目")}</strong>
        <span>${escapeHtml(item.meta || item.time || item.status || "")}</span>
      </div>
      <em>${escapeHtml(item.status || item.label || "")}</em>
    </article>
  `;
}

function renderVersionRow(item) {
  return `
    <article class="compact-row">
      <div>
        <strong>${escapeHtml(item.versionName || item.versionId || "版本")}</strong>
        <span>${escapeHtml(item.updatedAt || item.status || "")}</span>
      </div>
      <em>${escapeHtml(item.label || item.status || "")}</em>
    </article>
  `;
}

function renderTrendRow(item) {
  return `
    <article class="compact-row" data-tone="${escapeHtml(item.tone || "neutral")}">
      <div>
        <strong>${escapeHtml(item.title || "趋势")}</strong>
        <span>${escapeHtml(item.delta || "")}</span>
      </div>
      <em>${escapeHtml(item.tone || "观察")}</em>
    </article>
  `;
}

function renderGapRow(item) {
  return `
    <article class="compact-row">
      <div>
        <strong>${escapeHtml(item.title || "知识缺口")}</strong>
        <span>${escapeHtml(item.action || "去补充知识")}</span>
      </div>
      <em>${escapeHtml(item.status || "热")}</em>
    </article>
  `;
}

function renderToolCallRow(item) {
  return `
    <article class="compact-row">
      <div>
        <strong>${escapeHtml(item.name || "工具")}</strong>
        <span>${escapeHtml(item.latency || "")}</span>
      </div>
      <em>${escapeHtml(item.status || "")}</em>
    </article>
  `;
}

function renderKnowledgeSourceRow(item) {
  return `
    <article class="compact-row">
      <div>
        <strong>${escapeHtml(item.name || "知识来源")}</strong>
        <span>${escapeHtml(item.versionId || "")} · ${escapeHtml(item.sourceCount || 0)} 个目录</span>
      </div>
      <em>${escapeHtml(item.confidence || 0)}%</em>
    </article>
  `;
}

function renderSparkline(values) {
  const safeValues = Array.isArray(values) && values.length ? values : [3, 4, 3, 5, 4, 6, 5, 7];

  return safeValues.map((value) => {
    const height = Math.max(6, Math.min(28, Number(value || 0) * 3));
    return `<span style="height:${height}px"></span>`;
  }).join("");
}

function buildDefaultPromptCards() {
  return [
    { title: "接口超时排查", summary: "定位超时根因的关键步骤", prompt: "接口超时应该先看哪些配置、日志和依赖？" },
    { title: "版本能力对比", summary: "理解当前版本差异", prompt: "27.0.T101 和 26.3.0.1 有什么差异？" },
    { title: "调用链梳理", summary: "找出关键类与路径", prompt: "帮我梳理这个功能的调用链和关键类。" },
    { title: "沉淀为 FAQ", summary: "识别可复用知识", prompt: "这类问题能否沉淀成 FAQ 或 Skill？" }
  ];
}

function setText(element, value) {
  if (element) {
    element.textContent = String(value ?? "");
  }
}

async function loadVersions(defaultVersionId) {
  const payload = await fetchVersions();
  state.versions = Array.isArray(payload.versions) ? payload.versions : [];
  const preferredVersionId = pickPreferredVersionId(defaultVersionId || payload.defaultVersionId);
  renderVersionOptions();
  setSelectedVersion(preferredVersionId, { persist: true });
}

function pickPreferredVersionId(defaultVersionId) {
  if (state.selectedVersionId && state.versions.some((version) => version.id === state.selectedVersionId)) {
    return state.selectedVersionId;
  }

  if (defaultVersionId && state.versions.some((version) => version.id === defaultVersionId)) {
    return defaultVersionId;
  }

  return state.versions.find((version) => version.status === "active")?.id || state.versions[0]?.id || "";
}

function renderVersionOptions() {
  dom.versionSelect.innerHTML = "";

  if (state.versions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无可用版本";
    dom.versionSelect.append(option);
    return;
  }

  for (const version of state.versions) {
    const option = document.createElement("option");
    option.value = version.id;
    option.textContent = `${version.name || version.id} · ${version.status || "active"}`;
    dom.versionSelect.append(option);
  }
}

function setSelectedVersion(versionId, options = {}) {
  state.selectedVersionId = String(versionId || "").trim();
  dom.versionSelect.value = state.selectedVersionId;

  if (options.persist) {
    window.localStorage.setItem(VERSION_STORAGE_KEY, state.selectedVersionId);
  }

  updateSelectedVersionUI();
  renderCustomerKnowledgeScope(state.dashboard?.customer?.knowledgeScope || null);
  void insightsUi.loadInsightsPage();
}

function getSelectedVersion() {
  return state.versions.find((version) => version.id === state.selectedVersionId) || null;
}

function updateSelectedVersionUI() {
  const version = getSelectedVersion();

  if (!version) {
    dom.versionStatus.textContent = "必选";
    dom.versionDescription.textContent = state.versions.length ? "请选择一个版本后再提问。" : "没有可用版本，请检查服务端配置。";
    dom.sourceCount.textContent = "0";
    dom.currentVersionBadge.textContent = "未选择版本";
    dom.sourceList.innerHTML = "";
    dom.askButton.disabled = true;
    return;
  }

  dom.versionStatus.textContent = version.status || "active";
  dom.versionDescription.textContent = version.description || "当前版本暂无描述。";
  dom.sourceCount.textContent = String(version.sourceCount || 0);
  dom.currentVersionBadge.textContent = version.name || version.id;
  dom.askButton.disabled = state.isSubmitting;
  renderVersionSourceList(version);
}

function renderVersionSourceList(currentVersion) {
  dom.sourceList.innerHTML = "";

  for (const version of state.versions) {
    const item = document.createElement("li");
    item.dataset.active = version.id === currentVersion.id ? "true" : "false";
    item.innerHTML = `
      <strong>${escapeHtml(version.name || version.id)}</strong>
      <span>${escapeHtml(formatVersionMeta(version))}</span>
    `;
    dom.sourceList.append(item);
  }
}

function formatVersionMeta(version) {
  const tags = Array.isArray(version.tags) && version.tags.length ? ` · ${version.tags.join(", ")}` : "";
  return `${version.status || "active"} · ${version.sourceCount || 0} 个目录${tags}`;
}

function formatBoundarySummary(config) {
  const mode = config.retrievalMode || "检索模式";
  const toolCount = Array.isArray(config.allowedTools) ? config.allowedTools.length : 0;
  const tools = toolCount ? `只读 ${toolCount} 项` : "只读工具";
  const timeout = config.timeoutMs ? `${Math.round(config.timeoutMs / 1000)}s` : "";
  return [mode, tools, timeout].filter(Boolean).join(" · ");
}

function renderCapabilityStatus(config) {
  if (!dom.capabilityList || !dom.capabilitySummary) {
    return;
  }

  const capabilities = buildCapabilityItems(config);
  dom.capabilitySummary.textContent = config ? "3 项" : "未加载";
  dom.capabilityList.innerHTML = capabilities.map((item) => `
    <article class="capability-item" data-status="${escapeHtml(item.status)}">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.statusLabel)}</span>
      </div>
      <p>${escapeHtml(item.summary)}</p>
    </article>
  `).join("");
}

function buildCapabilityItems(config) {
  const capabilities = config?.capabilities || {};

  return [
    capabilities.queue || {
      name: "Queue",
      status: "unknown",
      statusLabel: "未加载",
      summary: "等待服务端返回队列状态。"
    },
    capabilities.telemetry || {
      name: "Telemetry",
      status: "unknown",
      statusLabel: "未加载",
      summary: "等待服务端返回 telemetry 状态。"
    },
    capabilities.skills || {
      name: "Skills",
      status: "unknown",
      statusLabel: "未加载",
      summary: "等待服务端返回 skills 状态。"
    }
  ];
}

function renderSessionList() {
  dom.sessionList.innerHTML = "";
  dom.sessionCount.textContent = String(sessionStore.sessions.length);

  for (const session of sessionStore.sessions) {
    const item = document.createElement("div");
    const mainButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const questionCount = session.messages.filter((message) => message.role === "user").length;
    item.className = "session-item";
    item.dataset.active = session.id === sessionStore.currentSessionId ? "true" : "false";
    mainButton.type = "button";
    mainButton.className = "session-main";
    mainButton.innerHTML = `
      <span class="session-title">${escapeHtml(session.title || "新会话")}</span>
      <span class="session-meta">${escapeHtml(`${questionCount} 问 · ${formatRelativeTime(session.updatedAt)}`)}</span>
    `;
    mainButton.addEventListener("click", () => {
      sessionStore.selectSession(session.id);
      renderSessionList();
      renderCurrentSession();
      dom.flowStatus.textContent = "已切换会话";
      dom.questionInput.focus();
    });
    deleteButton.type = "button";
    deleteButton.className = "session-delete";
    deleteButton.setAttribute("aria-label", `删除会话：${session.title || "新会话"}`);
    deleteButton.title = "删除会话";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => {
      deleteSession(session.id);
    });
    item.append(mainButton, deleteButton);
    dom.sessionList.append(item);
  }

  updateSessionHeader();
}

function renderCurrentSession() {
  const session = sessionStore.getCurrentSession();
  dom.conversation.innerHTML = "";
  state.hasMessages = false;

  if (!session || session.messages.length === 0) {
    renderEmptyState();
    updateSessionHeader();
    return;
  }

  for (const message of session.messages) {
    appendMessage(message.role, message.sender, message.content, message.meta);
  }

  updateSessionHeader();
}

function addMessageToCurrentSession(message) {
  sessionStore.addMessage(message);
  renderSessionList();
}

function deleteSession(sessionId) {
  const deletedCurrent = sessionStore.deleteSession(sessionId);
  renderSessionList();
  renderCurrentSession();
  dom.flowStatus.textContent = deletedCurrent ? "已删除当前会话" : "已删除会话";
  dom.questionInput.focus();
}

function buildContextHistory() {
  return sessionStore.buildContextHistory(getHistoryLimit());
}

function getHistoryLimit() {
  return Number(state.runtimeConfig?.historyMaxMessages || DEFAULT_HISTORY_MESSAGES);
}

function updateSessionHeader() {
  const session = sessionStore.getCurrentSession();
  const historyCount = Math.min(session?.messages?.length || 0, getHistoryLimit());

  dom.currentSessionName.textContent = session?.title || "新会话";
  dom.contextBadge.textContent = `上下文 ${historyCount} 条`;
}

function appendMessage(type, sender, body, meta = "") {
  if (!state.hasMessages) {
    dom.conversation.innerHTML = "";
    state.hasMessages = true;
  }

  const message = document.createElement("article");
  message.className = `message ${type}`;
  message.innerHTML = `
    <div class="message-header">
      <span>${escapeHtml(sender)}</span>
      <span class="message-meta">${escapeHtml(meta)}</span>
    </div>
    <div class="message-body">${escapeHtml(body)}</div>
  `;
  dom.conversation.append(message);
  dom.conversation.scrollTop = dom.conversation.scrollHeight;
  return message;
}

function getOperator() {
  const operator = dom.operatorInput.value.trim();
  return operator || "未填写账号";
}

function updateOperatorStatus() {
  const operator = getOperator();
  dom.operatorStatus.textContent = operator === "未填写账号"
    ? "用于问答记录"
    : `记录为：${operator}`;
  setText(dom.operatorChip, operator);
  setText(dom.customerOperatorName, operator === "未填写账号" ? "小满" : operator);
  setText(dom.opsOperatorName, operator === "未填写账号" ? "Wayne" : operator);
}

function updateMessage(message, body, meta = "") {
  message.querySelector(".message-body").textContent = body;
  message.querySelector(".message-meta").textContent = meta;
  dom.conversation.scrollTop = dom.conversation.scrollHeight;
}

function renderEmptyState() {
  dom.conversation.innerHTML = `
    <div class="empty-state">
      <div class="empty-mark">M</div>
      <span class="command-kicker">AI OPS COPILOT</span>
      <strong>Ask anything about this release.</strong>
      <p>选择版本后，直接询问接口、配置、日志、版本差异和知识缺口。</p>
      <div class="prompt-grid bento-prompts">
        <button type="button" data-prompt="这个接口超时应该先看哪些配置、日志和依赖？">
          <span>现网排障</span>
          <strong>接口超时排查</strong>
        </button>
        <button type="button" data-prompt="27.0.T101 和 26.3.0.1 这个功能有什么差异？">
          <span>版本差异</span>
          <strong>版本能力对比</strong>
        </button>
        <button type="button" data-prompt="帮我梳理这个功能的调用链和关键类。">
          <span>接口调用链</span>
          <strong>代码路径梳理</strong>
        </button>
        <button type="button" data-prompt="这类问题能否沉淀成 FAQ 或 Skill？">
          <span>知识缺口</span>
          <strong>沉淀为 FAQ / Skill</strong>
        </button>
      </div>
    </div>
  `;
  bindPromptButtons();
  dom.conversation.scrollTop = 0;
}

function bindPromptButtons() {
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    if (button.dataset.promptBound === "true") {
      return;
    }

    button.dataset.promptBound = "true";
    button.addEventListener("click", () => {
      setAppMode("customer", { persist: true });
      dom.questionInput.value = button.dataset.prompt || "";
      dom.form.requestSubmit();
    });
  });
}

function formatRelativeTime(value) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return "刚刚";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "刚刚";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDurationMs(value) {
  const ms = Number(value || 0);

  if (!Number.isFinite(ms) || ms <= 0) {
    return "0s";
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
