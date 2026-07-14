/**
 * Test constants and default values for test data generation
 */
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

interface CliSubprocessMappingCase {
  readonly name: string;
  readonly actual: unknown;
  readonly expected: unknown;
}

function precedes(left: number, right: number): boolean {
  return left < right;
}

function cliSubprocessMappingCases(): readonly CliSubprocessMappingCase[] {
  return [
    { name: "product root is absolute", actual: isAbsolute(PRODUCT_ROOT), expected: true },
    { name: "launcher is absolute", actual: isAbsolute(CLI_PATH), expected: true },
    { name: "launcher resolves under product root", actual: dirname(dirname(CLI_PATH)), expected: PRODUCT_ROOT },
    {
      name: "launcher suffix comes from artifact descriptor",
      actual: CLI_PATH.endsWith(PACKAGED_CLI_ARTIFACT.launcherPath),
      expected: true,
    },
    {
      name: "runtime executable comes from artifact descriptor",
      actual: NODE_EXECUTABLE,
      expected: PACKAGED_CLI_ARTIFACT.runtimeExecutable,
    },
    {
      name: "version flag comes from artifact descriptor",
      actual: VERSION_FLAG,
      expected: PACKAGED_CLI_ARTIFACT.invocationFlags.version,
    },
    {
      name: "source entrypoints come from artifact descriptor",
      actual: CLI_SOURCE_ENTRYPOINT_PATHS,
      expected: PACKAGED_CLI_ARTIFACT.sourceEntrypointPaths,
    },
    {
      name: "status threshold precedes process startup",
      actual: precedes(CLI_TIMEOUTS_MS.STATUS_CHECK_AVG, CLI_TIMEOUTS_MS.PROCESS_START),
      expected: true,
    },
    {
      name: "process startup precedes end-to-end",
      actual: precedes(CLI_TIMEOUTS_MS.PROCESS_START, CLI_TIMEOUTS_MS.E2E),
      expected: true,
    },
    {
      name: "end-to-end precedes batch",
      actual: precedes(CLI_TIMEOUTS_MS.E2E, CLI_TIMEOUTS_MS.E2E_BATCH),
      expected: true,
    },
    {
      name: "batch precedes long batch",
      actual: precedes(CLI_TIMEOUTS_MS.E2E_BATCH, CLI_TIMEOUTS_MS.E2E_LONG_BATCH),
      expected: true,
    },
  ];
}

export function registerCliSubprocessHarnessMappings(): void {
  describe("CLI subprocess test harness mapping", () => {
    it.each(cliSubprocessMappingCases())("maps $name", ({ actual, expected }) => {
      expect(actual).toEqual(expected);
    });
  });
}
