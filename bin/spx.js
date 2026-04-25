#!/usr/bin/env node

// CLI entry point
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BUILD_COMMAND = "pnpm run build";
const BUILT_CLI_FILENAME = "cli.js";
const DIST_DIRECTORY = "dist";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distPath = join(__dirname, "..", DIST_DIRECTORY, BUILT_CLI_FILENAME);

if (!existsSync(distPath)) {
  console.error(`Built CLI not found at ${distPath}`);
  console.error(`Run "${BUILD_COMMAND}" before invoking the packaged spx executable.`);
  process.exit(1);
}

try {
  await import(pathToFileURL(distPath).href);
} catch (err) {
  console.error("Failed to load built CLI:", err);
  process.exit(1);
}
