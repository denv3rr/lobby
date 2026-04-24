function normalizeRuntimeConfigFileName(fileName) {
  return typeof fileName === "string" ? fileName.trim().toLowerCase() : "";
}

export function isFeedRuntimeConfigFile(fileName) {
  return /^[a-z0-9_-]+-feed\.json$/i.test(normalizeRuntimeConfigFileName(fileName));
}

function parseTimestamp(value) {
  if (typeof value !== "string") {
    return -1;
  }
  const timestamp = Date.parse(value.trim());
  return Number.isFinite(timestamp) ? timestamp : -1;
}

function readItemFreshness(items) {
  if (!Array.isArray(items) || !items.length) {
    return -1;
  }

  let best = -1;
  for (const item of items) {
    const publishedAt = parseTimestamp(item?.publishedAt);
    if (publishedAt > best) {
      best = publishedAt;
    }
  }
  return best;
}

export function getFeedPayloadFreshness(payload) {
  if (!payload || typeof payload !== "object") {
    return -1;
  }

  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const metaFreshness = Math.max(
    parseTimestamp(meta.fetchedAt),
    parseTimestamp(meta.updatedAt)
  );
  const itemFreshness = readItemFreshness(payload.items);
  return metaFreshness >= 0 ? metaFreshness : itemFreshness;
}

export function selectPreferredFeedRuntimeSource(
  fileName,
  { localPayload = null, defaultsPayload = null } = {}
) {
  if (!isFeedRuntimeConfigFile(fileName)) {
    if (localPayload) {
      return "local";
    }
    if (defaultsPayload) {
      return "defaults";
    }
    return null;
  }

  if (localPayload && !defaultsPayload) {
    return "local";
  }
  if (defaultsPayload && !localPayload) {
    return "defaults";
  }
  if (!localPayload && !defaultsPayload) {
    return null;
  }

  const localFreshness = getFeedPayloadFreshness(localPayload);
  const defaultsFreshness = getFeedPayloadFreshness(defaultsPayload);
  if (localFreshness >= 0 && defaultsFreshness >= 0 && localFreshness !== defaultsFreshness) {
    return localFreshness > defaultsFreshness ? "local" : "defaults";
  }

  return "local";
}
