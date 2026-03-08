import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHANNEL_URL = "https://www.youtube.com/@seperet";
const CHANNEL_VIDEOS_URL = `${CHANNEL_URL}/videos`;

const OUTPUT_RECENT_LOCAL = path.join(ROOT_DIR, "public", "config", "videos-feed.json");
const OUTPUT_RECENT_DEFAULTS = path.join(ROOT_DIR, "public", "config.defaults", "videos-feed.json");
const OUTPUT_LONG_LOCAL = path.join(ROOT_DIR, "public", "config", "videos-long-feed.json");
const OUTPUT_LONG_DEFAULTS = path.join(ROOT_DIR, "public", "config.defaults", "videos-long-feed.json");

const DEFAULT_RECENT_LIMIT = 6;
const DEFAULT_LONG_LIMIT = 28;

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    recentLimit: DEFAULT_RECENT_LIMIT,
    longLimit: DEFAULT_LONG_LIMIT,
    strict: false,
    writeDefaults: false,
    writeLocal: true
  };

  for (const arg of argv) {
    if (arg === "--write-defaults") {
      options.writeDefaults = true;
    } else if (arg === "--defaults-only") {
      options.writeDefaults = true;
      options.writeLocal = false;
    } else if (arg === "--strict") {
      options.strict = true;
    } else if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.recentLimit = parsed;
      }
    } else if (arg.startsWith("--recent-limit=")) {
      const parsed = Number.parseInt(arg.slice("--recent-limit=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.recentLimit = parsed;
      }
    } else if (arg.startsWith("--long-limit=")) {
      const parsed = Number.parseInt(arg.slice("--long-limit=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.longLimit = parsed;
      }
    }
  }

  return options;
}

function decodeXml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "SeperetLobbyVideoSync/2.0 (+https://github.com/denv3rr/lobby)"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function extractChannelId(channelHtml) {
  const patterns = [
    /"channelId":"(UC[\w-]+)"/i,
    /"externalId":"(UC[\w-]+)"/i,
    /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[\w-]+)["']/i
  ];

  for (const pattern of patterns) {
    const match = channelHtml.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error("Could not resolve YouTube channel id from handle page.");
}

function extractTag(entryXml, tagName) {
  const match = entryXml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? decodeXml(match[1].trim()) : "";
}

function extractThumbnail(entryXml) {
  const match = entryXml.match(
    /<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*>/i
  );
  return match?.[1] ? decodeXml(match[1].trim()) : null;
}

function parseFeedEntries(feedXml, limit) {
  const entries = [];
  const seen = new Set();
  const segments = feedXml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];

  for (const segment of segments) {
    const videoId = extractTag(segment, "yt:videoId");
    if (!videoId || seen.has(videoId)) {
      continue;
    }

    const title = extractTag(segment, "title");
    const publishedAt = extractTag(segment, "published");
    const thumbnail = extractThumbnail(segment);

    entries.push({
      id: videoId,
      title: title || `Video ${videoId}`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      image: thumbnail,
      price: null,
      currency: null,
      tags: ["youtube", "video", "seperet", "recent"],
      publishedAt
    });
    seen.add(videoId);

    if (entries.length >= limit) {
      break;
    }
  }

  return entries;
}

function extractInitialDataJson(html) {
  const match =
    html.match(/var ytInitialData = (.*?);<\/script>/s) ||
    html.match(/ytInitialData\s*=\s*(\{.*?\});/s);
  if (!match?.[1]) {
    throw new Error("Could not locate ytInitialData on the channel videos page.");
  }
  return JSON.parse(match[1]);
}

function readRendererText(value) {
  if (!value) {
    return "";
  }
  if (typeof value.simpleText === "string") {
    return value.simpleText.trim();
  }
  if (Array.isArray(value.runs)) {
    return value.runs
      .map((entry) => (typeof entry?.text === "string" ? entry.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function extractRendererThumbnailUrl(renderer) {
  const thumbnails = renderer?.thumbnail?.thumbnails;
  if (!Array.isArray(thumbnails) || !thumbnails.length) {
    return null;
  }
  const preferred = thumbnails[thumbnails.length - 1];
  return typeof preferred?.url === "string" ? preferred.url : null;
}

function extractRendererDurationText(renderer) {
  const explicit = readRendererText(renderer?.lengthText);
  if (explicit) {
    return explicit;
  }

  for (const overlay of renderer?.thumbnailOverlays || []) {
    const timeStatus = overlay?.thumbnailOverlayTimeStatusRenderer;
    const text = readRendererText(timeStatus?.text);
    if (text) {
      return text;
    }
  }

  return "";
}

function parseDurationToSeconds(durationText = "") {
  const normalized = String(durationText || "").trim();
  if (!normalized.includes(":")) {
    return 0;
  }
  const parts = normalized
    .split(":")
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value));
  if (!parts.length) {
    return 0;
  }

  let multiplier = 1;
  let seconds = 0;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    seconds += parts[index] * multiplier;
    multiplier *= 60;
  }
  return seconds;
}

function collectVideoRenderers(node, results = []) {
  if (!node || typeof node !== "object") {
    return results;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectVideoRenderers(entry, results);
    }
    return results;
  }

  if (node.richItemRenderer?.content?.videoRenderer) {
    results.push(node.richItemRenderer.content.videoRenderer);
  }
  if (node.videoRenderer) {
    results.push(node.videoRenderer);
  }

  for (const value of Object.values(node)) {
    collectVideoRenderers(value, results);
  }

  return results;
}

function parseLongformItems(videosHtml, limit) {
  const data = extractInitialDataJson(videosHtml);
  const renderers = collectVideoRenderers(data, []);
  const items = [];
  const seen = new Set();

  for (const renderer of renderers) {
    const videoId =
      typeof renderer?.videoId === "string" ? renderer.videoId.trim() : "";
    if (!videoId || seen.has(videoId)) {
      continue;
    }

    const durationText = extractRendererDurationText(renderer);
    const durationSeconds = parseDurationToSeconds(durationText);
    if (!durationText || durationSeconds < 60) {
      continue;
    }

    const title = readRendererText(renderer?.title) || `Video ${videoId}`;
    const publishedText = readRendererText(renderer?.publishedTimeText);
    const viewCountText = readRendererText(renderer?.viewCountText);

    items.push({
      id: videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      image: extractRendererThumbnailUrl(renderer),
      price: null,
      currency: null,
      tags: ["youtube", "video", "seperet", "longform"],
      durationText,
      durationSeconds,
      publishedText: publishedText || null,
      viewCountText: viewCountText || null
    });
    seen.add(videoId);

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

async function readExistingFeed(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items)) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs();
  const errors = [];
  let channelId = "";
  let recentItems = [];
  let longItems = [];

  try {
    const channelHtml = await fetchText(CHANNEL_URL);
    channelId = extractChannelId(channelHtml);
  } catch (error) {
    errors.push({
      url: CHANNEL_URL,
      message: error.message
    });
  }

  if (channelId) {
    try {
      const feedXml = await fetchText(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
      );
      recentItems = parseFeedEntries(feedXml, options.recentLimit);
    } catch (error) {
      errors.push({
        url: "https://www.youtube.com/feeds/videos.xml",
        message: error.message
      });
    }
  }

  try {
    const videosHtml = await fetchText(CHANNEL_VIDEOS_URL);
    longItems = parseLongformItems(videosHtml, options.longLimit);
  } catch (error) {
    errors.push({
      url: CHANNEL_VIDEOS_URL,
      message: error.message
    });
  }

  const [recentFallback, longFallback] = await Promise.all([
    readExistingFeed(OUTPUT_RECENT_LOCAL).then((result) => result || readExistingFeed(OUTPUT_RECENT_DEFAULTS)),
    readExistingFeed(OUTPUT_LONG_LOCAL).then((result) => result || readExistingFeed(OUTPUT_LONG_DEFAULTS))
  ]);

  const resolvedRecentItems = recentItems.length ? recentItems : recentFallback?.items || [];
  const resolvedLongItems = longItems.length ? longItems : longFallback?.items || [];

  if (!resolvedRecentItems.length || !resolvedLongItems.length) {
    throw new Error(
      options.strict
        ? "Strict mode: could not resolve both recent and long-form YouTube feeds."
        : "Could not resolve both recent and long-form YouTube feeds, and no fallback exists."
    );
  }

  const fetchedAt = new Date().toISOString();
  const recentPayload = {
    meta: {
      source: "youtube-rss",
      channelUrl: CHANNEL_URL,
      channelId: channelId || recentFallback?.meta?.channelId || longFallback?.meta?.channelId || null,
      fetchedAt,
      count: resolvedRecentItems.length,
      usedFallback: recentItems.length === 0,
      errors
    },
    items: resolvedRecentItems.slice(0, options.recentLimit)
  };
  const longPayload = {
    meta: {
      source: "youtube-channel-videos",
      channelUrl: CHANNEL_URL,
      channelVideosUrl: CHANNEL_VIDEOS_URL,
      channelId: channelId || longFallback?.meta?.channelId || recentFallback?.meta?.channelId || null,
      fetchedAt,
      count: resolvedLongItems.length,
      usedFallback: longItems.length === 0,
      errors
    },
    items: resolvedLongItems.slice(0, options.longLimit)
  };

  if (options.writeLocal) {
    await Promise.all([
      writeJson(OUTPUT_RECENT_LOCAL, recentPayload),
      writeJson(OUTPUT_LONG_LOCAL, longPayload)
    ]);
    console.log(`Wrote ${OUTPUT_RECENT_LOCAL}`);
    console.log(`Wrote ${OUTPUT_LONG_LOCAL}`);
  }

  if (options.writeDefaults) {
    await Promise.all([
      writeJson(OUTPUT_RECENT_DEFAULTS, recentPayload),
      writeJson(OUTPUT_LONG_DEFAULTS, longPayload)
    ]);
    console.log(`Wrote ${OUTPUT_RECENT_DEFAULTS}`);
    console.log(`Wrote ${OUTPUT_LONG_DEFAULTS}`);
  }
}

main().catch((error) => {
  console.error(`Video sync failed: ${error.message}`);
  process.exitCode = 1;
});
