import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SHOP_URL = "https://seperet.com/shop";
const DEFAULT_LIMIT = 18;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_LOCAL = path.join(ROOT_DIR, "public", "config", "shop-feed.json");
const OUTPUT_DEFAULTS = path.join(ROOT_DIR, "public", "config.defaults", "shop-feed.json");

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    limit: DEFAULT_LIMIT,
    writeDefaults: false,
    writeLocal: true,
    strict: false
  };

  for (const arg of argv) {
    if (arg === "--write-defaults") {
      options.writeDefaults = true;
    } else if (arg === "--defaults-only") {
      options.writeDefaults = true;
      options.writeLocal = false;
    } else if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.split("=")[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    } else if (arg === "--strict") {
      options.strict = true;
    }
  }

  return options;
}

function readMetaTag(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return "";
}

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-");
}

function toAbsoluteUrl(candidate, originUrl) {
  try {
    return new URL(candidate, originUrl).toString();
  } catch {
    return null;
  }
}

function extractProductUrls(html, baseUrl, limit) {
  const discovered = new Set();
  const regexes = [
    /href=["'](\/shop\/p\/[^"']+)["']/gi,
    /\/shop\/p\/[a-z0-9-]+/gi,
    /https?:\/\/(?:www\.)?seperet\.com\/shop\/p\/[a-z0-9-]+/gi
  ];

  for (const regex of regexes) {
    for (const match of html.matchAll(regex)) {
      const raw = match[1] || match[0];
      const url = toAbsoluteUrl(raw, baseUrl);
      if (!url) {
        continue;
      }
      discovered.add(url);
      if (discovered.size >= limit) {
        break;
      }
    }
    if (discovered.size >= limit) {
      break;
    }
  }

  return [...discovered].slice(0, limit);
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const regex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(regex)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return blocks;
}

function flattenJsonLd(entry, output = []) {
  if (!entry) {
    return output;
  }
  if (Array.isArray(entry)) {
    for (const item of entry) {
      flattenJsonLd(item, output);
    }
    return output;
  }
  if (typeof entry === "object") {
    output.push(entry);
    if (entry["@graph"]) {
      flattenJsonLd(entry["@graph"], output);
    }
  }
  return output;
}

function pickProductJsonLd(blocks) {
  const flattened = [];
  for (const block of blocks) {
    flattenJsonLd(block, flattened);
  }
  return (
    flattened.find((item) => String(item?.["@type"] || "").toLowerCase().includes("product")) ||
    null
  );
}

function inferIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split("/").filter(Boolean).at(-1) || "item";
    return slug.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  } catch {
    return `item-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function toTitleCaseFromSlug(slug = "") {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parsePrice(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function normalizeImageUrl(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "SeperetLobbyShopSync/1.0 (+https://github.com/denv3rr/lobby)"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function parseProduct(url) {
  const html = await fetchText(url);
  const jsonLdBlocks = extractJsonLdBlocks(html);
  const productJson = pickProductJsonLd(jsonLdBlocks);

  const id = inferIdFromUrl(url);
  const fallbackTitle = toTitleCaseFromSlug(id);
  const title =
    readMetaTag(html, "og:title") ||
    productJson?.name ||
    readMetaTag(html, "twitter:title") ||
    fallbackTitle;

  const imageFromJson = Array.isArray(productJson?.image)
    ? productJson.image[0]
    : productJson?.image;
  const image =
    readMetaTag(html, "og:image") ||
    imageFromJson ||
    readMetaTag(html, "twitter:image") ||
    "";

  const price =
    parsePrice(readMetaTag(html, "product:price:amount")) ||
    parsePrice(productJson?.offers?.price) ||
    null;
  const currency =
    readMetaTag(html, "product:price:currency") ||
    productJson?.offers?.priceCurrency ||
    "USD";

  return {
    id,
    title,
    url,
    image: normalizeImageUrl(image),
    price,
    currency,
    tags: []
  };
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

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs();
  const errors = [];

  let productUrls = [];
  try {
    const shopHtml = await fetchText(SHOP_URL);
    productUrls = extractProductUrls(shopHtml, SHOP_URL, options.limit);
  } catch (error) {
    errors.push({ url: SHOP_URL, message: error.message });
    if (!options.strict) {
      throw error;
    }
    console.warn(`Shop fetch failed in strict mode: ${error.message}`);
  }

  if (!productUrls.length) {
    const message = "No product URLs found on shop page.";
    errors.push({ url: SHOP_URL, message });
    if (!options.strict) {
      throw new Error(message);
    }
    console.warn(`${message} Writing empty strict feed.`);
  }

  const items = [];
  for (const url of productUrls) {
    try {
      const item = await parseProduct(url);
      items.push(item);
      console.log(`Synced: ${item.title}`);
    } catch (error) {
      errors.push({ url, message: error.message });
      console.warn(`Skipped ${url}: ${error.message}`);
    }
  }

  const fallback =
    (await readExistingFeed(OUTPUT_LOCAL)) ||
    (await readExistingFeed(OUTPUT_DEFAULTS));
  const useFallback = items.length === 0 && !options.strict;
  const finalItems = items.length ? items : useFallback ? fallback?.items || [] : [];
  if (!finalItems.length) {
    if (!options.strict) {
      throw new Error("Failed to build shop feed and no fallback feed was available.");
    }
    console.warn("Strict mode: writing empty feed with no fallback items.");
  }

  const payload = {
    meta: {
      source: SHOP_URL,
      fetchedAt: new Date().toISOString(),
      count: finalItems.length,
      errors
    },
    items: finalItems
  };

  if (options.writeLocal) {
    await writeJson(OUTPUT_LOCAL, payload);
    console.log(`Wrote ${OUTPUT_LOCAL}`);
  }
  if (options.writeDefaults) {
    await writeJson(OUTPUT_DEFAULTS, payload);
    console.log(`Wrote ${OUTPUT_DEFAULTS}`);
  }
}

main().catch((error) => {
  console.error(`Shop sync failed: ${error.message}`);
  process.exitCode = 1;
});
