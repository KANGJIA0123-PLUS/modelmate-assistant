import crypto from "node:crypto";

export function hashText(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function makeId(prefix, parts) {
  const hash = hashText(Array.isArray(parts) ? parts.join("\u0000") : parts);
  return `${prefix}_${hash.slice(0, 24)}`;
}

export function normalizeIsoDate(value, fallback = new Date()) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback.toISOString();
}

export function safeJsonStringify(value, fallback = "{}") {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return fallback;
  }
}

export function parseJson(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
