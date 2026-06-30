// @ts-check

/** @typedef {import("../src/types/index.js").PublicConfigResponse} PublicConfigResponse */
/** @typedef {import("../src/types/index.js").VersionsResponse} VersionsResponse */
/** @typedef {import("../src/types/index.js").PublicDashboardResponse} PublicDashboardResponse */
/** @typedef {import("../src/types/index.js").AskStreamEvent} AskStreamEvent */
/** @typedef {import("../src/types/index.js").AskRequest} AskRequest */
/** @typedef {import("../src/types/index.js").ApiErrorResponse} ApiErrorResponse */
/** @typedef {import("../src/types/index.js").HistoryResponse} HistoryResponse */
/** @typedef {import("../src/types/index.js").FrequentQuestionsResponse} FrequentQuestionsResponse */
/** @typedef {import("../src/types/index.js").CategoriesResponse} CategoriesResponse */
/** @typedef {import("../src/types/index.js").InsightOverviewResponse} InsightOverviewResponse */
/** @typedef {import("../src/types/index.js").InsightFrequentQuestionsResponse} InsightFrequentQuestionsResponse */
/** @typedef {import("../src/types/index.js").InsightCategoriesResponse} InsightCategoriesResponse */
/** @typedef {import("../src/types/index.js").InsightVersionsResponse} InsightVersionsResponse */
/** @typedef {import("../src/types/index.js").KnowledgeGapsResponse} KnowledgeGapsResponse */
/** @typedef {import("../src/types/index.js").ImprovementSuggestionsResponse} ImprovementSuggestionsResponse */
/** @typedef {import("../src/types/index.js").EfficiencyOpportunitiesResponse} EfficiencyOpportunitiesResponse */
/** @typedef {import("../src/types/index.js").PublicImprovementSuggestion} PublicImprovementSuggestion */
/** @typedef {import("../src/types/index.js").ReportGenerateRequest} ReportGenerateRequest */
/** @typedef {import("../src/types/index.js").ReportGenerateResponse} ReportGenerateResponse */
/** @typedef {import("../src/types/index.js").ReportJobsResponse} ReportJobsResponse */
/** @typedef {import("../src/types/index.js").ReportsResponse} ReportsResponse */
/** @typedef {import("../src/types/index.js").ReportDetailResponse} ReportDetailResponse */
/** @typedef {import("../src/types/index.js").PublicReportJob} PublicReportJob */

/** @typedef {Record<string, string | number | boolean | null | undefined | Array<string | number | boolean>>} QueryParams */

/**
 * @typedef {object} OpenAskStreamOptions
 * @property {string} question
 * @property {string} [operator]
 * @property {Array<{ role: "user" | "assistant", content: string }>} [history]
 * @property {string} versionId
 * @property {AbortSignal} [signal]
 */

/** @returns {Promise<PublicConfigResponse>} */
export async function fetchRuntimeConfig() {
  return fetchJson("/api/config");
}

/** @returns {Promise<VersionsResponse>} */
export async function fetchVersions() {
  return fetchJson("/api/versions");
}

/** @returns {Promise<PublicDashboardResponse>} */
export async function fetchDashboard() {
  return fetchJson("/api/dashboard");
}

/**
 * @param {OpenAskStreamOptions} options
 * @returns {Promise<Response>}
 */
export async function openAskStream({ question, operator, history, versionId, signal }) {
  let response;

  try {
    response = await fetch("/api/ask-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ question, operator, history, versionId }),
      signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("请求已取消。");
    }

    throw error;
  }

  if (!response.ok) {
    const payload = await readJsonPayload(response);
    throw new Error(getApiErrorMessage(payload, "请求失败。"));
  }

  if (!response.body) {
    throw new Error("当前浏览器不支持流式响应。");
  }

  return response;
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<HistoryResponse>}
 */
export async function fetchHistory(params = {}) {
  return fetchJson(withQuery("/api/history", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<FrequentQuestionsResponse>}
 */
export async function fetchFrequentQuestions(params = {}) {
  return fetchJson(withQuery("/api/frequent", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<CategoriesResponse>}
 */
export async function fetchCategoryStats(params = {}) {
  return fetchJson(withQuery("/api/categories", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<InsightOverviewResponse>}
 */
export async function fetchInsightOverview(params = {}) {
  return fetchJson(withQuery("/api/insights/overview", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<InsightFrequentQuestionsResponse>}
 */
export async function fetchInsightFrequentQuestions(params = {}) {
  return fetchJson(withQuery("/api/insights/frequent-questions", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<InsightCategoriesResponse>}
 */
export async function fetchInsightCategories(params = {}) {
  return fetchJson(withQuery("/api/insights/categories", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<InsightVersionsResponse>}
 */
export async function fetchInsightVersions(params = {}) {
  return fetchJson(withQuery("/api/insights/versions", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<KnowledgeGapsResponse>}
 */
export async function fetchKnowledgeGaps(params = {}) {
  return fetchJson(withQuery("/api/insights/knowledge-gaps", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<ImprovementSuggestionsResponse>}
 */
export async function fetchImprovementSuggestions(params = {}) {
  return fetchJson(withQuery("/api/insights/improvement-suggestions", params));
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<EfficiencyOpportunitiesResponse>}
 */
export async function fetchEfficiencyOpportunities(params = {}) {
  return fetchJson(withQuery("/api/insights/efficiency-opportunities", params));
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @returns {Promise<PublicImprovementSuggestion>}
 */
export async function updateImprovementSuggestion(id, patch) {
  return fetchJson(`/api/improvement-suggestions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

/**
 * @param {ReportGenerateRequest} request
 * @returns {Promise<ReportGenerateResponse>}
 */
export async function generateInsightReport(request) {
  return fetchJson("/api/reports/generate", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<ReportJobsResponse>}
 */
export async function fetchReportJobs(params = {}) {
  return fetchJson(withQuery("/api/report-jobs", params));
}

/**
 * @param {string} jobId
 * @returns {Promise<PublicReportJob>}
 */
export async function fetchReportJob(jobId) {
  return fetchJson(`/api/report-jobs/${encodeURIComponent(jobId)}`);
}

/**
 * @param {QueryParams} [params]
 * @returns {Promise<ReportsResponse>}
 */
export async function fetchReports(params = {}) {
  return fetchJson(withQuery("/api/reports", params));
}

/**
 * @param {string} reportId
 * @returns {Promise<ReportDetailResponse>}
 */
export async function fetchReport(reportId) {
  return fetchJson(`/api/reports/${encodeURIComponent(reportId)}`);
}

/**
 * @param {string} reportId
 * @returns {Promise<string>}
 */
export async function fetchReportMarkdown(reportId) {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/markdown`);

  if (!response.ok) {
    const payload = await readJsonPayload(response);
    throw new Error(getApiErrorMessage(payload, "请求失败。"));
  }

  return response.text();
}

/**
 * @template T
 * @param {string | URL} url
 * @param {RequestInit} [options]
 * @returns {Promise<T>}
 */
export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });
  const payload = await readJsonPayload(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "请求失败。"));
  }

  return /** @type {T} */ (payload);
}

/**
 * @param {unknown} payload
 * @param {string} fallback
 * @returns {string}
 */
function getApiErrorMessage(payload, fallback) {
  return isApiErrorPayload(payload) ? payload.error : fallback;
}

/**
 * @param {string} path
 * @param {QueryParams} params
 * @returns {string}
 */
function withQuery(path, params) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    const normalized = Array.isArray(value) ? value.join(",") : String(value);
    if (normalized) {
      searchParams.set(key, normalized);
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * @param {unknown} payload
 * @returns {payload is ApiErrorResponse}
 */
function isApiErrorPayload(payload) {
  return isRecord(payload) && typeof payload.error === "string";
}

/**
 * @param {Response} response
 * @returns {Promise<unknown>}
 */
async function readJsonPayload(response) {
  return response.json().catch(() => ({}));
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isAbortError(error) {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
