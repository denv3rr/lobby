import { deleteRuntimeConfig, readRuntimeConfig, writeRuntimeConfig } from "./scripts/configWorkspace.mjs";
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

export default defineConfig(({ command }) => {
  const base = resolveBasePath(command);

  return {
    base,
    plugins: [createDevConfigApiPlugin()],
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
