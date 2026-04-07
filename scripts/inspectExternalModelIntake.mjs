import process from "node:process";

import {
  DEFAULT_EXTERNAL_MODEL_SOURCE_DIR,
  buildExternalModelIntakeManifest
} from "./modelAssetAnalysis.mjs";

async function main() {
  const sourceDir = process.env.LOBBY_EXTERNAL_MODEL_SOURCE_DIR || DEFAULT_EXTERNAL_MODEL_SOURCE_DIR;
  const manifest = await buildExternalModelIntakeManifest({ sourceDir });

  console.log(`External model intake source: ${manifest.sourceDir}`);
  console.log(
    `External model intake summary: ${manifest.summary.portableCount}/${manifest.summary.totalCount} portable | ` +
      `${manifest.summary.rejectedCount} rejected | ${manifest.summary.animatedCount} animated`
  );

  for (const entry of manifest.entries) {
    const metrics = entry.metrics
      ? `${Math.round(entry.metrics.fileBytes / 1000)} KB | ` +
        `${entry.metrics.triangleCount} tris | ` +
        `${entry.metrics.materialCount} mats | ` +
        `${entry.metrics.textureCount} tex`
      : "analysis unavailable";
    const status = entry.portable ? "PASS" : "FAIL";
    const failureText = entry.failures.length ? ` | ${entry.failures.join("; ")}` : "";
    console.log(`- [${status}] ${entry.relativePath} | ${metrics}${failureText}`);
  }
}

main().catch((error) => {
  console.error(`External model intake inspection failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
