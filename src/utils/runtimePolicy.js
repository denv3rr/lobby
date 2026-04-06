function readText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function toSearchParams(value) {
  if (value instanceof URLSearchParams) {
    return value;
  }
  if (typeof value === "string") {
    return new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
  }
  return new URLSearchParams();
}

export function isLocalAuthoringHostName(hostname) {
  const normalized = readText(hostname, "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  );
}

export function shouldEnableLocalEditor(params, { isDev = false, hostname = "" } = {}) {
  const searchParams = toSearchParams(params);
  if (searchParams.get("editor") !== "1") {
    return false;
  }
  return Boolean(isDev) || isLocalAuthoringHostName(hostname);
}

export function shouldEnableLocalDebugUi(params, { isDev = false, hostname = "" } = {}) {
  const searchParams = toSearchParams(params);
  if (searchParams.get("debugui") !== "1") {
    return false;
  }
  return Boolean(isDev) || isLocalAuthoringHostName(hostname);
}

export function normalizeExternalUrl(value, { baseUrl = "http://localhost/" } = {}) {
  const raw = readText(value, "");
  if (!raw) {
    return "";
  }

  try {
    const resolved = new URL(raw, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return "";
    }
    return resolved.toString();
  } catch {
    return "";
  }
}
