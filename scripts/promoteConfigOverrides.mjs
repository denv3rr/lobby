import process from "node:process";

import {
  isRuntimeConfigFile,
  listRuntimeConfigFiles,
  promoteLocalOverrides
} from "./configWorkspace.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    deleteLocal: false,
    files: []
  };

  for (const arg of argv) {
    if (arg === "--delete-local") {
      options.deleteLocal = true;
      continue;
    }

    const normalized = typeof arg === "string" ? arg.trim() : "";
    if (!normalized) {
      continue;
    }
    options.files.push(normalized);
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const discoveredFiles = await listRuntimeConfigFiles("effective");
  const requestedFiles = options.files.length ? options.files : discoveredFiles;
  const validFiles = requestedFiles.filter((fileName) => isRuntimeConfigFile(fileName));

  if (!validFiles.length) {
    throw new Error(
      `No supported config files selected. Detected runtime files: ${discoveredFiles.join(", ")}`
    );
  }

  const promoted = await promoteLocalOverrides(validFiles, {
    deleteLocal: options.deleteLocal
  });

  if (!promoted.length) {
    console.log("No local runtime overrides were available to promote.");
    return;
  }

  console.log(`Promoted ${promoted.length} runtime config file(s): ${promoted.join(", ")}`);
}

main().catch((error) => {
  console.error(`Promote failed: ${error.message}`);
  process.exitCode = 1;
});
