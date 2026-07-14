/**
 * Test constants and default values for test data generation
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PACKAGED_CLI_ARTIFACT } from "@/interfaces/cli/artifact";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Product root directory (absolute path)
 */
export const PRODUCT_ROOT = resolve(__dirname, "../..");

/**
 * Node.js executable used by subprocess CLI tests.
 */
export const NODE_EXECUTABLE = PACKAGED_CLI_ARTIFACT.runtimeExecutable;

/**
 * CLI binary path (absolute path)
 */
export const CLI_PATH = resolve(PRODUCT_ROOT, PACKAGED_CLI_ARTIFACT.launcherPath);

/**
 * Common CLI flags used across test files.
 */
export const VERSION_FLAG = PACKAGED_CLI_ARTIFACT.invocationFlags.version;

/** Source entrypoints compiled into the packaged CLI. */
export const CLI_SOURCE_ENTRYPOINT_PATHS = PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths;

/**
 * CLI performance thresholds in milliseconds
 *
 * E2E tests spawn a new Node.js process which has startup overhead.
 * These thresholds account for both CLI execution and process overhead.
 */
export const CLI_TIMEOUTS_MS = {
  /** Node.js process startup overhead (~200-500ms depending on system load) */
  PROCESS_START: 500,
  /** Spec parsing/scanning operations */
  SPEC_PARSE: 100,
  /**
   * Wall-clock threshold for a single CLI subprocess under test-suite load.
   *
   * The product spec's <100ms target applies once the CLI process is already
   * running. E2E tests also include Node startup plus worker-pool contention
   * from the surrounding Vitest run, so they need a wider guardrail.
   */
  E2E: 10000,
  /** Timeout for batched E2E tests that execute several CLI subprocesses. */
  E2E_BATCH: 45000,
  /** Timeout for full-suite batched E2E tests with heavy validation contention. */
  E2E_LONG_BATCH: 120000,
  /** Average per-call ceiling for direct status checks in integration tests. */
  STATUS_CHECK_AVG: 15,
} as const;
