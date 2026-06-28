// @ts-check

/** @typedef {import("../src/types/index.js").PublicConfigResponse} PublicConfigResponse */
/** @typedef {import("../src/types/index.js").VersionsResponse} VersionsResponse */
/** @typedef {import("../src/types/index.js").AskStreamEvent} AskStreamEvent */
/** @typedef {import("../src/types/index.js").AskRequest} AskRequest */
/** @typedef {import("../src/types/index.js").ApiErrorResponse} ApiErrorResponse */

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
