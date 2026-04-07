import { createReadStream } from "node:fs";
import { deleteRuntimeConfig, readRuntimeConfig, writeRuntimeConfig } from "./scripts/configWorkspace.mjs";
import {
  DEFAULT_EXTERNAL_MODEL_SOURCE_DIR,
  buildExternalModelIntakeManifest,
  resolveExternalModelAbsolutePath
} from "./scripts/modelAssetAnalysis.mjs";
import { defineConfig } from "vite";

function ensureTrailingSlash(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    return "/";
  }
  return normalized.replace(/\/?$/, "/");
}

function resolveBasePath(command) {
  if (command === "serve") {
    return "/";
  }

  const explicit = process.env.VITE_BASE_PATH;
  if (explicit) {
    return ensureTrailingSlash(explicit);
  }

  const repoName =
    typeof process.env.GITHUB_REPOSITORY === "string"
      ? process.env.GITHUB_REPOSITORY.split("/").pop()?.trim()
      : "";
  return repoName ? `/${repoName}/` : "/lobby/";
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function streamFile(res, filePath, contentType = "application/octet-stream") {
  return new Promise((resolve, reject) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("close", resolve);
    stream.pipe(res);
  });
}

function createDevConfigApiPlugin() {
  return {
    name: "lobby-dev-config-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/config", async (req, res, next) => {
        try {
          const requestUrl = new URL(req.url || "/", "http://localhost");
          const queryFile = requestUrl.searchParams.get("file") || "";
          const querySource = requestUrl.searchParams.get("source") || "effective";
          const queryTarget = requestUrl.searchParams.get("target") || "local";

          if (req.method === "GET") {
            const config = await readRuntimeConfig(queryFile, querySource);
            sendJson(res, 200, {
              ok: true,
              ...config
            });
            return;
          }

          if (req.method === "POST") {
            const body = await readRequestBody(req);
            const fileName = body.fileName || body.file || queryFile;
            const action = body.action || "write";

            if (action === "delete") {
              const deleted = await deleteRuntimeConfig(fileName, body.target || queryTarget);
              sendJson(res, 200, {
                ok: true,
                ...deleted
              });
              return;
            }

            const written = await writeRuntimeConfig(
              fileName,
              body.target || queryTarget,
              body.text ?? body.json ?? {}
            );
            sendJson(res, 200, {
              ok: true,
              ...written
            });
            return;
          }

          if (req.method === "DELETE") {
            const deleted = await deleteRuntimeConfig(queryFile, queryTarget);
            sendJson(res, 200, {
              ok: true,
              ...deleted
            });
            return;
          }

          sendJson(res, 405, {
            ok: false,
            error: `Unsupported method ${req.method}`
          });
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : "Unexpected dev config API error."
          });
        }
      });
    }
  };
}

function createDevModelIntakeApiPlugin() {
  let manifestCache = {
    sourceDir: "",
    atMs: 0,
    payload: null
  };

  async function readManifest(forceRefresh = false) {
    const sourceDir = process.env.LOBBY_EXTERNAL_MODEL_SOURCE_DIR || DEFAULT_EXTERNAL_MODEL_SOURCE_DIR;
    const now = Date.now();
    if (
      !forceRefresh &&
      manifestCache.payload &&
      manifestCache.sourceDir === sourceDir &&
      now - manifestCache.atMs < 3000
    ) {
      return manifestCache.payload;
    }

    const payload = await buildExternalModelIntakeManifest({ sourceDir });
    manifestCache = {
      sourceDir,
      atMs: now,
      payload
    };
    return payload;
  }

  return {
    name: "lobby-dev-model-intake-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/model-intake", async (req, res) => {
        try {
          if (req.method !== "GET") {
            sendJson(res, 405, {
              ok: false,
              error: `Unsupported method ${req.method}`
            });
            return;
          }

          const requestUrl = new URL(req.url || "/", "http://localhost");
          const forceRefresh = requestUrl.searchParams.get("refresh") === "1";
          const manifest = await readManifest(forceRefresh);

          if (requestUrl.pathname === "/file") {
            const requestedPath = requestUrl.searchParams.get("path") || "";
            const entry = manifest.entries.find((item) => item.relativePath === requestedPath) || null;
            if (!entry) {
              sendJson(res, 404, {
                ok: false,
                error: `Unknown model intake path "${requestedPath}".`
              });
              return;
            }
            if (!entry.portable) {
              sendJson(res, 409, {
                ok: false,
                error: `Model "${entry.relativePath}" did not pass portability checks.`
              });
              return;
            }

            const absolutePath = resolveExternalModelAbsolutePath(manifest.sourceDir, entry.relativePath);
            if (!absolutePath) {
              sendJson(res, 400, {
                ok: false,
                error: `Model path "${entry.relativePath}" could not be resolved safely.`
              });
              return;
            }

            await streamFile(res, absolutePath, "model/gltf-binary");
            return;
          }

          sendJson(res, 200, {
            ok: true,
            ...manifest
          });
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : "Unexpected dev model intake API error."
          });
        }
      });
    }
  };
}

export default defineConfig(({ command }) => {
  const base = resolveBasePath(command);

  return {
    base,
    plugins: [createDevConfigApiPlugin(), createDevModelIntakeApiPlugin()],
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/three/examples/jsm/loaders/GLTFLoader")) {
              return "three-gltf";
            }
            if (id.includes("node_modules/three")) {
              return "three-core";
            }
            if (/[\\/]src[\\/]systems[\\/]catalog[\\/]/.test(id)) {
              return "catalog";
            }
            if (/[\\/]src[\\/]systems[\\/]theming[\\/]atmosphere\.js$/.test(id)) {
              return "atmosphere";
            }
            if (/[\\/]src[\\/]systems[\\/]audio[\\/]/.test(id)) {
              return "audio";
            }
          }
        }
      }
    }
  };
});
