import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README_URL = "https://raw.githubusercontent.com/denv3rr/denv3rr/main/README.md";
const OUTPUT_LOCAL = path.join(ROOT_DIR, "public", "config", "projects-feed.json");
const OUTPUT_DEFAULTS = path.join(ROOT_DIR, "public", "config.defaults", "projects-feed.json");
const FALLBACK_WORKSHOP_URL =
  "https://reforger.armaplatform.com/workshop";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    strict: false,
    writeLocal: true,
    writeDefaults: false,
    workshopUrl: "",
    workshopTitle: "South Padre Island (Arma Reforger Mod)"
  };

  for (const arg of argv) {
    if (arg === "--write-defaults") {
      options.writeDefaults = true;
    } else if (arg === "--defaults-only") {
      options.writeDefaults = true;
      options.writeLocal = false;
    } else if (arg === "--strict") {
      options.strict = true;
    } else if (arg.startsWith("--workshop-url=")) {
      options.workshopUrl = arg.slice("--workshop-url=".length).trim();
    } else if (arg.startsWith("--workshop-title=")) {
      options.workshopTitle = arg.slice("--workshop-title=".length).trim();
    }
  }

  if (!options.workshopUrl && process.env.SOUTH_PADRE_WORKSHOP_URL) {
    options.workshopUrl = process.env.SOUTH_PADRE_WORKSHOP_URL.trim();
  }
  if (
    (!options.workshopTitle || options.workshopTitle === "South Padre Island (Arma Reforger Mod)") &&
    process.env.SOUTH_PADRE_WORKSHOP_TITLE
  ) {
    options.workshopTitle = process.env.SOUTH_PADRE_WORKSHOP_TITLE.trim();
  }

  return options;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "SeperetLobbyProjectSync/1.0 (+https://github.com/denv3rr/lobby)"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function toTitle(slug = "") {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractPinnedRepos(readmeText) {
  const regex = /https:\/\/github\.com\/denv3rr\/([A-Za-z0-9_.-]+)/g;
  const seen = new Set();
  const repos = [];

  for (const match of readmeText.matchAll(regex)) {
    const name = match[1];
    if (!name || seen.has(name.toLowerCase())) {
      continue;
    }
    repos.push(name);
    seen.add(name.toLowerCase());
  }

  const preferred = [];
  const priority = ["clear", "AirTrace", "denv3rr.github.io", "network-explorer"];
  for (const repo of priority) {
    if (repos.includes(repo)) {
      preferred.push(repo);
    }
  }
  for (const repo of repos) {
    if (preferred.length >= 4) {
      break;
    }
    if (!preferred.includes(repo)) {
      preferred.push(repo);
    }
  }
  return preferred.slice(0, 4);
}

async function fetchRepoMeta(repoName) {
  const apiUrl = `https://api.github.com/repos/denv3rr/${repoName}`;
  const response = await fetch(apiUrl, {
    headers: {
      "user-agent": "SeperetLobbyProjectSync/1.0 (+https://github.com/denv3rr/lobby)"
    }
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function extractMetaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  return html.match(pattern)?.[1] || "";
}

function extractArtworkUrls(html, sourceUrl) {
  const output = [];
  const seen = new Set();
  const patterns = [
    /https:\/\/ar-gcp-cdn\.bistudio\.com\/image\/[^"'\s)]+?\.(?:jpg|jpeg|png|webp)/gi,
    /https:\/\/steamuserimages-a\.akamaihd\.net\/ugc\/[^"'\s)]+?\.(?:jpg|jpeg|png|webp)/gi,
    /https:\/\/images\.steamusercontent\.com\/ugc\/[^"'\s)]+?\.(?:jpg|jpeg|png|webp)/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = match[0];
      if (!url || seen.has(url)) {
        continue;
      }
      output.push({
        url,
        title: "Screenshot"
      });
      seen.add(url);
      if (output.length >= 12) {
        return output;
      }
    }
  }

  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage && !seen.has(ogImage)) {
    output.unshift({
      url: ogImage,
      title: "Cover"
    });
  }

  if (!output.length && sourceUrl) {
    output.push({
      url: sourceUrl,
      title: "Workshop"
    });
  }

  return output;
}

async function buildSouthPadreItem(workshopUrl, workshopTitle) {
  const safeUrl = workshopUrl || FALLBACK_WORKSHOP_URL;
  if (!workshopUrl) {
    return {
      id: "south-padre-island",
      title: workshopTitle || "South Padre Island (Arma Reforger Mod)",
      url: safeUrl,
      image: null,
      price: null,
      currency: null,
      tags: ["reforger", "workshop", "core"],
      artwork: []
    };
  }

  try {
    const html = await fetchText(workshopUrl);
    const ogTitle = extractMetaContent(html, "og:title");
    const ogImage = extractMetaContent(html, "og:image");
    const artwork = extractArtworkUrls(html, ogImage || workshopUrl);
    return {
      id: "south-padre-island",
      title: ogTitle || workshopTitle || "South Padre Island (Arma Reforger Mod)",
      url: workshopUrl,
      image: ogImage || null,
      price: null,
      currency: null,
      tags: ["reforger", "workshop", "core"],
      artwork
    };
  } catch {
    return {
      id: "south-padre-island",
      title: workshopTitle || "South Padre Island (Arma Reforger Mod)",
      url: workshopUrl,
      image: null,
      price: null,
      currency: null,
      tags: ["reforger", "workshop", "core"],
      artwork: []
    };
  }
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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

async function main() {
  const options = parseArgs();
  const fallback =
    (await readExistingFeed(OUTPUT_LOCAL)) ||
    (await readExistingFeed(OUTPUT_DEFAULTS));
  const errors = [];
  let items = [];

  try {
    const readme = await fetchText(README_URL);
    const repos = extractPinnedRepos(readme);
    if (!repos.length) {
      throw new Error("Could not resolve pinned repos from profile README.");
    }

    for (const repoName of repos.slice(0, 4)) {
      const meta = await fetchRepoMeta(repoName);
      const title = toTitle(repoName.replace(/\.github\.io$/i, " site"));
      items.push({
        id: repoName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"),
        title: meta?.name || title,
        url: `https://github.com/denv3rr/${repoName}`,
        image: `https://opengraph.githubassets.com/1/denv3rr/${repoName}`,
        price: null,
        currency: null,
        tags: ["core", "github", "project"],
        artwork: []
      });
    }

    items.push(await buildSouthPadreItem(options.workshopUrl, options.workshopTitle));
  } catch (error) {
    errors.push({
      url: README_URL,
      message: error.message
    });
    if (!options.strict) {
      console.warn(`Project sync warning: ${error.message}`);
    }
  }

  const finalItems = items.length ? items : fallback?.items || [];
  if (!finalItems.length) {
    throw new Error(
      options.strict
        ? "Strict mode: project sync generated zero items."
        : "Project sync failed and no fallback feed was available."
    );
  }

  const payload = {
    meta: {
      source: "github-readme-plus-workshop",
      updatedAt: new Date().toISOString(),
      count: finalItems.length,
      workshopUrl: options.workshopUrl || null,
      usedFallback: items.length === 0,
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
  console.error(`Project sync failed: ${error.message}`);
  process.exitCode = 1;
});
