const form = document.querySelector("#ask-form");
const questionInput = document.querySelector("#question");
const conversation = document.querySelector("#conversation");
const askButton = document.querySelector("#ask-button");
const clearButton = document.querySelector("#clear-button");
const operatorInput = document.querySelector("#operator-input");
const operatorStatus = document.querySelector("#operator-status");
const versionSelect = document.querySelector("#version-select");
const versionStatus = document.querySelector("#version-status");
const versionDescription = document.querySelector("#version-description");
const runtimeStatus = document.querySelector("#runtime-status");
const sourceList = document.querySelector("#source-list");
const modelName = document.querySelector("#model-name");
const statusModel = document.querySelector("#status-model");
const retrievalMode = document.querySelector("#retrieval-mode");
const toolList = document.querySelector("#tool-list");
const sourceCount = document.querySelector("#source-count");
const contextWindow = document.querySelector("#context-window");
const timeoutValue = document.querySelector("#timeout-value");
const warningList = document.querySelector("#warning-list");
const flowStatus = document.querySelector("#flow-status");
const sessionList = document.querySelector("#session-list");
const sessionCount = document.querySelector("#session-count");
const newSessionButton = document.querySelector("#new-session-button");
const currentSessionName = document.querySelector("#current-session-name");
const contextBadge = document.querySelector("#context-badge");
const currentVersionBadge = document.querySelector("#current-version-badge");

const SESSION_STORAGE_KEY = "modelmate.sessions.v1";
const CURRENT_SESSION_KEY = "modelmate.currentSessionId";
const VERSION_STORAGE_KEY = "modelmate.selectedVersionId";
const MAX_SESSIONS = 30;
const MAX_STORED_MESSAGES = 80;
const DEFAULT_HISTORY_MESSAGES = 8;

let runtimeConfig = null;
let versions = [];
let selectedVersionId = window.localStorage.getItem(VERSION_STORAGE_KEY) || "";
let sessions = loadSessions();
let currentSessionId = window.localStorage.getItem(CURRENT_SESSION_KEY) || "";
let hasMessages = false;
let isSubmitting = false;

ensureCurrentSession();
operatorInput.value = window.localStorage.getItem("modelmate.operator") || "";
updateOperatorStatus();
await loadRuntimeConfig();
renderSessionList();
renderCurrentSession();

operatorInput.addEventListener("input", () => {
  window.localStorage.setItem("modelmate.operator", operatorInput.value.trim());
  updateOperatorStatus();
});

versionSelect.addEventListener("change", () => {
  setSelectedVersion(versionSelect.value, { persist: true });
  flowStatus.textContent = selectedVersionId ? "待命" : "请选择版本";
});

newSessionButton.addEventListener("click", () => {
  const session = createSession();
  sessions.unshift(session);
  currentSessionId = session.id;
  persistSessions();
  renderSessionList();
  renderCurrentSession();
  flowStatus.textContent = "待命";
  questionInput.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = questionInput.value.trim();
  const version = getSelectedVersion();

  if (!version) {
    flowStatus.textContent = "请先选择版本";
    versionSelect.focus();
    return;
  }

  if (!question) {
    questionInput.focus();
    return;
  }

  const operator = getOperator();
  const history = buildContextHistory();
  const session = getCurrentSession();
  updateSessionTitleFromQuestion(session, question);
  addMessageToCurrentSession({
    role: "user",
    sender: operator,
    content: question,
    meta: "",
    createdAt: new Date().toISOString()
  });
  appendMessage("user", operator, question);
  questionInput.value = "";
  askButton.disabled = true;
  askButton.textContent = "处理中";
  isSubmitting = true;
  flowStatus.textContent = "检索中";

  const pending = appendMessage("assistant", "助手", "正在检索本地资料...");
  const processPanel = createProcessPanel(pending, { operator, question, historyCount: history.length, version });

  try {
    const payload = await askStreaming({ question, operator, history, versionId: version.id, message: pending, processPanel });
    addMessageToCurrentSession({
      role: "assistant",
      sender: "助手",
      content: payload?.answer || "没有返回内容。",
      meta: formatMeta(payload || {}),
      createdAt: new Date().toISOString()
    });
    flowStatus.textContent = "待命";
  } catch (error) {
    pending.classList.add("error");
    markProcessError(processPanel, error.message || String(error));
    updateMessage(pending, error.message || String(error));
    flowStatus.textContent = "异常";
  } finally {
    isSubmitting = false;
    askButton.disabled = !getSelectedVersion();
    askButton.textContent = "发送";
    questionInput.focus();
  }
});

clearButton.addEventListener("click", () => {
  const session = getCurrentSession();

  if (session) {
    session.messages = [];
    session.title = "新会话";
    touchSession(session);
    persistSessions();
  }

  renderSessionList();
  renderCurrentSession();
  flowStatus.textContent = "待命";
});

async function loadRuntimeConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    runtimeConfig = config;

    runtimeStatus.textContent = `运行于 ${config.host}:${config.port}`;
    runtimeStatus.innerHTML = `<span class="signal-dot"></span><span>${escapeHtml(`运行于 ${config.host}:${config.port}`)}</span>`;
    modelName.textContent = config.displayModel || config.model || "Claude Code 默认";
    statusModel.textContent = config.displayModel || config.model || "Claude Code 默认";
    retrievalMode.textContent = config.retrievalMode || "-";
    toolList.textContent = config.allowedTools?.join(", ") || "-";
    contextWindow.textContent = [
      config.contextMaxChars ? `${config.contextMaxChars} chars` : "",
      config.historyMaxMessages ? `${config.historyMaxMessages} turns` : ""
    ].filter(Boolean).join(" / ") || "-";
    timeoutValue.textContent = config.timeoutMs ? `${Math.round(config.timeoutMs / 1000)}s` : "-";
    updateSessionHeader();
    await loadVersions(config.defaultVersionId);

    if (config.warnings?.length) {
      warningList.hidden = false;
      warningList.textContent = config.warnings.join("\n");
    }
  } catch (error) {
    runtimeStatus.textContent = "连接失败";
    warningList.hidden = false;
    warningList.textContent = error.message || String(error);
    updateSelectedVersionUI();
  }
}

async function loadVersions(defaultVersionId) {
  const response = await fetch("/api/versions");

  if (!response.ok) {
    throw new Error("版本列表加载失败。");
  }

  const payload = await response.json();
  versions = Array.isArray(payload.versions) ? payload.versions : [];
  const preferredVersionId = pickPreferredVersionId(defaultVersionId || payload.defaultVersionId);
  renderVersionOptions();
  setSelectedVersion(preferredVersionId, { persist: true });
}

function pickPreferredVersionId(defaultVersionId) {
  if (selectedVersionId && versions.some((version) => version.id === selectedVersionId)) {
    return selectedVersionId;
  }

  if (defaultVersionId && versions.some((version) => version.id === defaultVersionId)) {
    return defaultVersionId;
  }

  return versions.find((version) => version.status === "active")?.id || versions[0]?.id || "";
}

function renderVersionOptions() {
  versionSelect.innerHTML = "";

  if (versions.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无可用版本";
    versionSelect.append(option);
    return;
  }

  for (const version of versions) {
    const option = document.createElement("option");
    option.value = version.id;
    option.textContent = `${version.name || version.id} · ${version.status || "active"}`;
    versionSelect.append(option);
  }
}

function setSelectedVersion(versionId, options = {}) {
  selectedVersionId = String(versionId || "").trim();
  versionSelect.value = selectedVersionId;

  if (options.persist) {
    window.localStorage.setItem(VERSION_STORAGE_KEY, selectedVersionId);
  }

  updateSelectedVersionUI();
}

function getSelectedVersion() {
  return versions.find((version) => version.id === selectedVersionId) || null;
}

function updateSelectedVersionUI() {
  const version = getSelectedVersion();

  if (!version) {
    versionStatus.textContent = "必选";
    versionDescription.textContent = versions.length ? "请选择一个版本后再提问。" : "没有可用版本，请检查服务端配置。";
    sourceCount.textContent = "0";
    currentVersionBadge.textContent = "未选择版本";
    sourceList.innerHTML = "";
    askButton.disabled = true;
    return;
  }

  versionStatus.textContent = version.status || "active";
  versionDescription.textContent = version.description || "当前版本暂无描述。";
  sourceCount.textContent = String(version.sourceCount || 0);
  currentVersionBadge.textContent = version.name || version.id;
  askButton.disabled = isSubmitting;
  renderVersionSourceList(version);
}

function renderVersionSourceList(currentVersion) {
  sourceList.innerHTML = "";

  for (const version of versions) {
    const item = document.createElement("li");
    item.dataset.active = version.id === currentVersion.id ? "true" : "false";
    item.innerHTML = `
      <strong>${escapeHtml(version.name || version.id)}</strong>
      <span>${escapeHtml(formatVersionMeta(version))}</span>
    `;
    sourceList.append(item);
  }
}

function formatVersionMeta(version) {
  const tags = Array.isArray(version.tags) && version.tags.length ? ` · ${version.tags.join(", ")}` : "";
  return `${version.status || "active"} · ${version.sourceCount || 0} 个目录${tags}`;
}

function loadSessions() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY) || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeSession)
      .filter(Boolean)
      .sort(sortByUpdatedAtDesc)
      .slice(0, MAX_SESSIONS);
  } catch {
    return [];
  }
}

function ensureCurrentSession() {
  if (!sessions.length) {
    const session = createSession();
    sessions = [session];
    currentSessionId = session.id;
    persistSessions();
    return;
  }

  if (!sessions.some((session) => session.id === currentSessionId)) {
    currentSessionId = sessions[0].id;
    window.localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
  }
}

function createSession() {
  const now = new Date().toISOString();

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: "新会话",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function normalizeSession(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id || "").trim();

  if (!id) {
    return null;
  }

  const createdAt = normalizeDate(value.createdAt);
  const updatedAt = normalizeDate(value.updatedAt || value.createdAt);
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeStoredMessage).filter(Boolean).slice(-MAX_STORED_MESSAGES)
    : [];

  return {
    id,
    title: String(value.title || "新会话").trim().slice(0, 60) || "新会话",
    createdAt,
    updatedAt,
    messages
  };
}

function normalizeStoredMessage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const role = value.role === "assistant" ? "assistant" : value.role === "user" ? "user" : "";
  const content = String(value.content || "").trim();

  if (!role || !content) {
    return null;
  }

  return {
    role,
    sender: String(value.sender || (role === "assistant" ? "助手" : "用户")).trim().slice(0, 80),
    content,
    meta: String(value.meta || "").trim().slice(0, 240),
    createdAt: normalizeDate(value.createdAt)
  };
}

function normalizeDate(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function persistSessions() {
  sessions = sessions.sort(sortByUpdatedAtDesc).slice(0, MAX_SESSIONS);
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
  window.localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId);
}

function renderSessionList() {
  sessionList.innerHTML = "";
  sessionCount.textContent = String(sessions.length);

  for (const session of sessions) {
    const item = document.createElement("div");
    const mainButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const questionCount = session.messages.filter((message) => message.role === "user").length;
    item.className = "session-item";
    item.dataset.active = session.id === currentSessionId ? "true" : "false";
    mainButton.type = "button";
    mainButton.className = "session-main";
    mainButton.innerHTML = `
      <span class="session-title">${escapeHtml(session.title || "新会话")}</span>
      <span class="session-meta">${escapeHtml(`${questionCount} 问 · ${formatRelativeTime(session.updatedAt)}`)}</span>
    `;
    mainButton.addEventListener("click", () => {
      currentSessionId = session.id;
      persistSessions();
      renderSessionList();
      renderCurrentSession();
      flowStatus.textContent = "已切换会话";
      questionInput.focus();
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
    sessionList.append(item);
  }

  updateSessionHeader();
}

function renderCurrentSession() {
  const session = getCurrentSession();
  conversation.innerHTML = "";
  hasMessages = false;

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

function getCurrentSession() {
  ensureCurrentSession();
  return sessions.find((session) => session.id === currentSessionId) || sessions[0];
}

function addMessageToCurrentSession(message) {
  const session = getCurrentSession();

  if (!session) {
    return;
  }

  session.messages.push(normalizeStoredMessage(message));
  session.messages = session.messages.filter(Boolean).slice(-MAX_STORED_MESSAGES);
  touchSession(session);
  persistSessions();
  renderSessionList();
}

function deleteSession(sessionId) {
  const deletedCurrent = sessionId === currentSessionId;
  sessions = sessions.filter((session) => session.id !== sessionId);

  if (!sessions.length) {
    const session = createSession();
    sessions = [session];
    currentSessionId = session.id;
  } else if (deletedCurrent) {
    currentSessionId = sessions[0].id;
  }

  persistSessions();
  renderSessionList();
  renderCurrentSession();
  flowStatus.textContent = deletedCurrent ? "已删除当前会话" : "已删除会话";
  questionInput.focus();
}

function touchSession(session) {
  session.updatedAt = new Date().toISOString();
}

function updateSessionTitleFromQuestion(session, question) {
  if (!session || (session.title && session.title !== "新会话")) {
    return;
  }

  session.title = truncateText(question.replace(/\s+/g, " "), 24);
  touchSession(session);
  persistSessions();
}

function buildContextHistory() {
  const session = getCurrentSession();
  const limit = getHistoryLimit();

  if (!session || limit <= 0) {
    return [];
  }

  return session.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-limit)
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

function getHistoryLimit() {
  return Number(runtimeConfig?.historyMaxMessages || DEFAULT_HISTORY_MESSAGES);
}

function updateSessionHeader() {
  const session = getCurrentSession();
  const historyCount = Math.min(session?.messages?.length || 0, getHistoryLimit());

  currentSessionName.textContent = session?.title || "新会话";
  contextBadge.textContent = `上下文 ${historyCount} 条`;
}

function sortByUpdatedAtDesc(left, right) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
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

function appendMessage(type, sender, body, meta = "") {
  if (!hasMessages) {
    conversation.innerHTML = "";
    hasMessages = true;
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
  conversation.append(message);
  conversation.scrollTop = conversation.scrollHeight;
  return message;
}

function getOperator() {
  const operator = operatorInput.value.trim();
  return operator || "未填写账号";
}

function updateOperatorStatus() {
  const operator = getOperator();
  operatorStatus.textContent = operator === "未填写账号"
    ? "用于问答记录"
    : `记录为：${operator}`;
}

function updateMessage(message, body, meta = "") {
  message.querySelector(".message-body").textContent = body;
  message.querySelector(".message-meta").textContent = meta;
  conversation.scrollTop = conversation.scrollHeight;
}

function renderEmptyState() {
  conversation.innerHTML = `
    <div class="empty-state">
      <div class="empty-mark">M</div>
      <strong>开始提问</strong>
      <div class="prompt-grid">
        <button type="button" data-prompt="请根据 README.md 说明这个助手的用途，并引用依据。">README 用途</button>
        <button type="button" data-prompt="请阅读 src/claude-runner.mjs，说明 askClaude 的处理流程。">调用流程</button>
        <button type="button" data-prompt="请根据当前项目文件，给出这个助手下一步最值得优化的 3 点。">优化建议</button>
      </div>
    </div>
  `;
  bindPromptButtons();
  conversation.scrollTop = 0;
}

function formatMeta(payload) {
  const seconds = payload.elapsedMs ? `${(payload.elapsedMs / 1000).toFixed(1)}s` : "";
  const version = payload.versionName || "";
  const quick = payload.quickReply ? "quick" : "";
  const turns = payload.claude?.numTurns ? `${payload.claude.numTurns} turns` : "";
  const models = payload.claude?.modelNames?.length ? payload.claude.modelNames.join(", ") : "";
  const cost = payload.claude?.totalCostUsd ? `$${payload.claude.totalCostUsd}` : "";
  const sources = payload.context?.usedFiles?.length ? `${payload.context.usedFiles.length} sources` : "";
  const history = payload.historyCount ? `${payload.historyCount} history` : "";
  return [seconds, version, quick, models, turns, cost, sources, history].filter(Boolean).join(" / ");
}

async function askStreaming({ question, operator, history, versionId, message, processPanel }) {
  const response = await fetch("/api/ask-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question, operator, history, versionId })
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "请求失败。");
  }

  if (!response.body) {
    throw new Error("当前浏览器不支持流式响应。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = {
    answer: "",
    meta: "",
    startedAt: Date.now(),
    processPanel,
    historyCount: history.length,
    versionId,
    hasOutput: false
  };
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = parseStreamEvent(line);

      if (!event) {
        continue;
      }

      handleStreamEvent(event, state, message);

      if (event.type === "done") {
        return event.payload;
      }

      if (event.type === "error") {
        throw new Error(event.error || "流式响应失败。");
      }
    }
  }
}

function handleStreamEvent(event, state, message) {
  updateProcessFromEvent(event, state);

  if (event.type === "history") {
    state.historyCount = event.count || 0;
    return;
  }

  if (event.type === "status") {
    flowStatus.textContent = event.message || "处理中";

    if (!state.answer) {
      updateMessage(message, event.message || "Claude Code 正在处理...", state.meta || elapsedMeta(state.startedAt));
    }

    return;
  }

  if (event.type === "context") {
    const sources = event.context?.usedFiles?.length || 0;
    state.meta = sources ? `${sources} sources` : "";
    return;
  }

  if (event.type === "meta" && event.model) {
    state.meta = [event.model, state.meta].filter(Boolean).join(" / ");

    if (!state.answer) {
      updateMessage(message, "已连接模型，正在等待输出...", state.meta);
    }

    return;
  }

  if (event.type === "delta") {
    if (!state.hasOutput) {
      state.hasOutput = true;
      completeProcessStep(state.processPanel, "thinking", "思考完成，开始输出");
      completeProcessStep(state.processPanel, "claude", "已开始流式输出回答");
      upsertProcessStep(state.processPanel, "first-output", "首段输出", "已收到模型文本增量", "done");
    }

    state.answer += event.text || "";
    flowStatus.textContent = "生成中";
    updateMessage(message, state.answer, state.meta);
    return;
  }

  if (event.type === "done") {
    updateMessage(message, event.payload?.answer || state.answer || "没有返回内容。", formatMeta(event.payload || {}));
    finalizeProcessPanel(state.processPanel, event.payload || {}, state.startedAt);
  }
}

function createProcessPanel(message, { operator, question, historyCount, version }) {
  const details = document.createElement("details");
  details.className = "process-panel";
  details.open = true;
  details.innerHTML = `
    <summary>
      <span>调用过程</span>
      <span class="process-summary">准备中</span>
    </summary>
    <ol class="process-steps"></ol>
  `;

  const body = message.querySelector(".message-body");
  if (body) {
    body.before(details);
  } else {
    message.append(details);
  }
  upsertProcessStep(details, "receive", "接收问题", `${operator} · ${truncateText(question, 42)}`, "done");
  upsertProcessStep(details, "version", "版本路由", `${version.name || version.id} · ${version.sourceCount || 0} 个目录`, "done");
  upsertProcessStep(details, "history", "会话上下文", historyCount > 0 ? `已带入最近 ${historyCount} 条消息` : "当前会话暂无可带入历史", "done");
  return details;
}

function updateProcessFromEvent(event, state) {
  const panel = state.processPanel;

  if (!panel) {
    return;
  }

  if (event.type === "start") {
    if (event.versionName) {
      upsertProcessStep(panel, "version", "版本路由", `${event.versionName} · ${event.versionId || ""}`, "done");
    }

    if (event.historyCount > 0) {
      upsertProcessStep(panel, "history", "会话上下文", `已带入最近 ${event.historyCount} 条消息`, "done");
    }

    setProcessSummary(panel, "已接收请求");
    return;
  }

  if (event.type === "history") {
    upsertProcessStep(panel, "history", "会话上下文", `已加载最近 ${event.count || 0} 条消息`, "done");
    return;
  }

  if (event.type === "status") {
    const message = event.message || "Claude Code 正在处理";

    if (message.includes("版本化")) {
      upsertProcessStep(panel, "version", "版本路由", message, "done");
      upsertProcessStep(panel, "claude", "Claude Code", "只读工具准备中", "active");
    } else if (message.includes("检索")) {
      upsertProcessStep(panel, "retrieval", "本地检索", message, "active");
    } else if (message.includes("等待模型")) {
      upsertProcessStep(panel, "retrieval", "本地检索", "检索完成", "done");
      upsertProcessStep(panel, "claude", "Claude Code", message, "active");
    } else if (message.includes("请求模型")) {
      upsertProcessStep(panel, "claude", "Claude Code", message, "active");
    } else if (message.includes("思考")) {
      upsertProcessStep(panel, "thinking", "模型状态", message, "active");
    } else {
      upsertProcessStep(panel, "status", "处理状态", message, "active");
    }

    setProcessSummary(panel, message);
    return;
  }

  if (event.type === "context") {
    const context = event.context || {};
    const files = context.usedFiles || [];
    const usesClaudeTools = runtimeConfig?.retrievalMode === "claude-tools";
    const detail = files.length
      ? `命中 ${files.length} 个来源：${files.map(shortPath).join("、")}`
      : usesClaudeTools
        ? "已启用当前版本的 Claude Code 只读工具"
        : "本地知识库未命中，必要时将使用模型通用知识";

    upsertProcessStep(panel, usesClaudeTools ? "claude-tools" : "retrieval", usesClaudeTools ? "只读工具" : "本地检索", detail, "done");
    setProcessSummary(panel, files.length ? `命中 ${files.length} 个来源` : usesClaudeTools ? "只读工具已启用" : "本地未命中");
    return;
  }

  if (event.type === "meta") {
    const parts = [];

    if (event.model) {
      parts.push(`模型 ${event.model}`);
    }

    if (event.sessionId) {
      parts.push(`会话 ${event.sessionId.slice(0, 8)}`);
    }

    upsertProcessStep(panel, "claude", "Claude Code", parts.join(" · ") || "已连接", "active");
    setProcessSummary(panel, event.model ? `已连接 ${event.model}` : "已连接模型");
  }
}

function upsertProcessStep(panel, key, title, detail, state) {
  if (!panel) {
    return;
  }

  const list = panel.querySelector(".process-steps");
  let item = list.querySelector(`[data-step="${key}"]`);

  if (!item) {
    item = document.createElement("li");
    item.dataset.step = key;
    item.innerHTML = `
      <span class="process-dot"></span>
      <div>
        <strong></strong>
        <p></p>
      </div>
    `;
    list.append(item);
  }

  item.dataset.state = state || "pending";
  item.querySelector("strong").textContent = title;
  item.querySelector("p").textContent = detail || "";
}

function finalizeProcessPanel(panel, payload, startedAt) {
  if (!panel) {
    return;
  }

  completeActiveProcessSteps(panel);
  completeProcessStep(panel, "thinking", "思考完成");
  completeProcessStep(panel, "claude", "模型已返回结果");
  const detailParts = [];
  const seconds = payload.elapsedMs ? `${(payload.elapsedMs / 1000).toFixed(1)}s` : `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  detailParts.push(seconds);

  if (payload.claude?.modelNames?.length) {
    detailParts.push(payload.claude.modelNames.join(", "));
  }

  if (payload.context?.usedFiles?.length) {
    detailParts.push(`${payload.context.usedFiles.length} sources`);
  }

  if (payload.historyCount) {
    detailParts.push(`${payload.historyCount} history`);
  }

  if (payload.quickReply) {
    detailParts.push("quick reply");
  }

  upsertProcessStep(panel, "complete", "完成", detailParts.join(" · "), "done");
  setProcessSummary(panel, `已完成 · ${detailParts.join(" · ")}`);
  panel.open = false;
}

function completeActiveProcessSteps(panel) {
  if (!panel) {
    return;
  }

  panel.querySelectorAll('.process-steps li[data-state="active"]').forEach((item) => {
    const key = item.dataset.step || "";
    item.dataset.state = "done";

    if (key === "thinking") {
      item.querySelector("p").textContent = "思考完成";
    }

    if (key === "claude") {
      item.querySelector("p").textContent = "模型已返回结果";
    }
  });
}

function completeProcessStep(panel, key, detail) {
  const item = panel?.querySelector(`.process-steps li[data-step="${key}"]`);

  if (!item) {
    return;
  }

  item.dataset.state = "done";

  if (detail) {
    item.querySelector("p").textContent = detail;
  }
}

function markProcessError(panel, message) {
  if (!panel) {
    return;
  }

  completeActiveProcessSteps(panel);
  upsertProcessStep(panel, "error", "调用失败", message, "error");
  setProcessSummary(panel, "调用失败");
  panel.open = true;
}

function setProcessSummary(panel, text) {
  const summary = panel?.querySelector(".process-summary");

  if (summary) {
    summary.textContent = text || "";
  }
}

function truncateText(value, maxLength) {
  const text = String(value || "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function shortPath(filePath) {
  const parts = String(filePath || "").split(/[\\/]/);
  return parts.slice(-2).join("/");
}

function parseStreamEvent(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function elapsedMeta(startedAt) {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function startPendingStatus(message) {
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

    if (seconds < 5) {
      updateMessage(message, "正在检索本地资料...");
      flowStatus.textContent = "检索中";
      return;
    }

    if (seconds < 30) {
      updateMessage(message, `已交给 Claude Code 生成（${seconds}s），本地模型可能需要几十秒...`);
      flowStatus.textContent = "生成中";
      return;
    }

    updateMessage(message, `仍在生成（${seconds}s）。如果知识源很多或本地模型较慢，会多等一会儿。`);
    flowStatus.textContent = `${seconds}s`;
  }, 1000);

  return () => window.clearInterval(timer);
}

function bindPromptButtons() {
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      questionInput.value = button.dataset.prompt || "";
      form.requestSubmit();
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
