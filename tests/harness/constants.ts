/**
 * Test constants and default values for test data generation
 */
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Re-export from production code (per ADR-21: single source of truth)
export { LEAF_KIND, WORK_ITEM_KINDS } from "@/types";

/**
 * Project root directory (absolute path)
 */
export const PROJECT_ROOT = resolve(__dirname, "../..");

/**
 * Test fixtures directory (absolute path)
 */
export const FIXTURES_ROOT = resolve(PROJECT_ROOT, "tests/fixtures");

/**
 * CLI binary path (absolute path)
 */
export const CLI_PATH = resolve(PROJECT_ROOT, "bin/spx.js");

/**
 * Default BSP number for test data
 */
export const DEFAULT_BSP_NUMBER = 20;

/**
 * Minimum valid BSP number
 */
export const MIN_BSP_NUMBER = 10;

/**
 * Maximum valid BSP number
 */
export const MAX_BSP_NUMBER = 99;

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
  /** E2E threshold: accounts for process startup + CLI execution + system variance.
   * CI runners (GitHub Actions) are slower than local dev machines. */
  E2E: 3000,
} as const;
