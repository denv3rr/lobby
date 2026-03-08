import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve } from "node:path";

function ensureLeadingSlash(value) {
  return value.startsWith("/") ? value : `/${value}`;
}

function ensureTrailingSlash(value) {
  return value.replace(/\/?$/, "/");
}

function normalizeBasePath(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "/";
  }
  return ensureTrailingSlash(ensureLeadingSlash(normalized));
}

function parseArg(name, fallback = "") {
  const args = process.argv.slice(2);
  const flag = `--${name}`;
  const index = args.findIndex((entry) => entry === flag || entry.startsWith(`${flag}=`));
  if (index < 0) {
    return fallback;
  }
  const entry = args[index];
  if (entry.includes("=")) {
    return entry.slice(entry.indexOf("=") + 1);
  }
  return args[index + 1] ?? fallback;
}

function detectBasePath(distIndexPath) {
  try {
    const html = readFileSync(distIndexPath, "utf8");
    const match = html.match(/(?:src|href)="(\/[^"]*?)assets\//i);
    return normalizeBasePath(match?.[1] || "/");
  } catch {
    return "/";
  }
}

function getContentType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".ogg":
      return "audio/ogg";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".glb":
      return "model/gltf-binary";
    default:
      return "application/octet-stream";
  }
}

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

const host = parseArg("host", "127.0.0.1");
const port = Number.parseInt(parseArg("port", process.env.PORT || "4173"), 10) || 4173;
const distDir = resolve(process.cwd(), "dist");
const distIndexPath = resolve(distDir, "index.html");
const basePath = normalizeBasePath(
  parseArg("base", process.env.PLAYWRIGHT_BASE_PATH || process.env.VITE_BASE_PATH || "") ||
    detectBasePath(distIndexPath)
);

if (!existsSync(distIndexPath)) {
  console.error("[serveDist] Missing dist/index.html. Run `npm run build` first.");
  process.exit(1);
}

function sendFile(res, filePath) {
  res.statusCode = 200;
  res.setHeader("Content-Type", getContentType(filePath));
  createReadStream(filePath).pipe(res);
}

function sendIndex(res) {
  sendFile(res, distIndexPath);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
    const pathname = decodeURIComponent(requestUrl.pathname || "/");

    if (pathname === "/" && basePath !== "/") {
      res.statusCode = 302;
      res.setHeader("Location", `${basePath}${requestUrl.search || ""}`);
      res.end();
      return;
    }

    if (basePath !== "/" && pathname === basePath.slice(0, -1)) {
      res.statusCode = 302;
      res.setHeader("Location", `${basePath}${requestUrl.search || ""}`);
      res.end();
      return;
    }

    if (basePath !== "/" && !pathname.startsWith(basePath)) {
      sendJson(res, 404, {
        ok: false,
        error: `Path ${pathname} is outside preview base ${basePath}.`
      });
      return;
    }

    const relativePath = pathname.startsWith(basePath)
      ? pathname.slice(basePath.length)
      : pathname.replace(/^\//, "");
    const normalizedRelativePath = relativePath || "index.html";
    const safePath = normalize(normalizedRelativePath).replace(/^[\\/]+/, "");
    const resolvedPath = resolve(distDir, safePath);

    if (!resolvedPath.startsWith(distDir)) {
      sendJson(res, 403, {
        ok: false,
        error: "Blocked path traversal attempt."
      });
      return;
    }

    if (isFile(resolvedPath)) {
      sendFile(res, resolvedPath);
      return;
    }

    if (!extname(safePath)) {
      sendIndex(res);
      return;
    }

    sendJson(res, 404, {
      ok: false,
      error: `Missing asset ${safePath}.`
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected preview server error."
    });
  }
});

server.listen(port, host, () => {
  console.log(`[serveDist] Serving ${distDir} at http://${host}:${port}${basePath}`);
});
