import fs from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "dist");
const defaultsDir = path.join(distDir, "config.defaults");
const compatDir = path.join(distDir, "config");

async function ensureCompatConfig() {
  try {
    await fs.access(defaultsDir);
  } catch {
    console.warn("[syncConfigAliases] Missing dist/config.defaults, skipping alias sync.");
    return;
  }

  await fs.mkdir(compatDir, { recursive: true });
  const entries = await fs.readdir(defaultsDir, { withFileTypes: true });
  const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

  await Promise.all(
    jsonFiles.map((file) =>
      fs.copyFile(path.join(defaultsDir, file.name), path.join(compatDir, file.name))
    )
  );

  console.log(`[syncConfigAliases] Copied ${jsonFiles.length} config file(s) into dist/config.`);
}

ensureCompatConfig().catch((error) => {
  console.error("[syncConfigAliases] Failed:", error);
  process.exitCode = 1;
});
