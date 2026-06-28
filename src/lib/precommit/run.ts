/**
 * Pre-commit test orchestration for spx test integration.
 *
 * Coordinates test execution during pre-commit hooks:
 * - Determines if tests should run based on staged files
 * - Executes spx test with appropriate arguments
 * - Provides clear output on test results
 *
 * Uses dependency injection for subprocess calls to enable unit testing.
 *
 * @module precommit/run
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import {
  GIT_DIFF_FILTER_FLAG,
  GIT_NAME_STATUS_FLAG,
  GIT_NULL_DELIMITED_FLAG,
  pathsFromNameStatus,
} from "@/lib/git/name-status";

import { buildSpxTestArgs } from "./build-args";
import { filterTestRelevantFiles } from "./categorize";
import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "./config";
import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "./entrypoint";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Pre-commit run constants.
 * DRY constants verified in tests rather than using literal strings.
 */
export const PRECOMMIT_RUN = {
  /** Messages for pre-commit output */
  MESSAGES: {
    /** Message when skipping tests due to no relevant files */
    SKIPPING_NO_RELEVANT: "No test-relevant files staged, skipping tests",
    /** Message when starting test run */
    RUNNING_TESTS: "Running tests for staged files...",
    /** Message when tests pass */
    TESTS_PASSED: "All tests passed",
    /** Message when tests fail */
    TESTS_FAILED: "Tests failed",
  },
  /** Exit codes */
  EXIT_CODES: {
    /** Success exit code */
    SUCCESS: 0,
    /** Failure exit code */
    FAILURE: 1,
  },
} as const;

export const PRECOMMIT_STAGED_FILES_COMMAND = `git diff --cached ${GIT_NAME_STATUS_FLAG} ${GIT_NULL_DELIMITED_FLAG}`;
export const PRECOMMIT_STAGED_FILES_EXCLUDED_DIFF_FILTER_FLAG = GIT_DIFF_FILTER_FLAG;

export function stagedFilesFromGitOutput(output: string): string[] {
  return [...pathsFromNameStatus(output)];
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of running spx test.
 */
export interface SpxTestResult {
  /** Process exit code */
  exitCode: number;
  /** Combined stdout and stderr output */
  output: string;
}

/**
 * Dependencies for pre-commit test execution.
 * Enables dependency injection for testability.
 */
export interface PrecommitDeps {
  /**
   * Get list of staged files from git.
   * @returns Array of staged file paths relative to repo root
   */
  getStagedFiles: () => Promise<string[]>;

  /**
   * Run spx test with the given arguments.
   * @param args - spx CLI arguments
   * @returns Result containing exit code and output
   */
  runSpxTest: (args: string[]) => Promise<SpxTestResult>;

  /**
   * Log a message to console.
   * @param message - Message to log
   */
  log?: (message: string) => void;
}

/**
 * Result of pre-commit test execution.
 */
export interface PrecommitResult {
  /** Whether tests were skipped (no relevant files) */
  skipped: boolean;
  /** Process exit code (0 = success, non-zero = failure) */
  exitCode: number;
  /** Output message for the user */
  message: string;
  /** spx test output if tests were run */
  testOutput?: string;
}

type SpawnOutputValue = string | null | undefined;

// =============================================================================
// PURE FUNCTIONS
// =============================================================================

/**
 * Determines if tests should run based on staged files.
 *
 * Tests should run if there are any test-relevant files staged:
 * - Test files (ending in .test.ts)
 * - Source files (in src/ directory)
 *
 * @param files - Array of staged file paths
 * @returns True if tests should run
 *
 * @example
 * ```typescript
 * shouldRunTests(["tests/unit/foo.test.ts"]); // true
 * shouldRunTests(["src/validation/runner.ts"]); // true
 * shouldRunTests(["README.md", "package.json"]); // false
 * shouldRunTests([]); // false
 * ```
 */
export function shouldRunTests(files: string[], config: PrecommitConfig = PRECOMMIT_DEFAULTS): boolean {
  const relevantFiles = filterTestRelevantFiles(files, config);
  return relevantFiles.length > 0;
}

export function combineTestProcessOutput(stdout: SpawnOutputValue, stderr: SpawnOutputValue): string {
  return `${stdout ?? ""}${stderr ?? ""}`;
}

// =============================================================================
// ORCHESTRATION
// =============================================================================

/**
 * Run pre-commit tests.
 *
 * Orchestrates the complete pre-commit test workflow:
 * 1. Get staged files from git
 * 2. Determine if tests should run
 * 3. If relevant files exist, run spx test
 * 4. Return result with appropriate exit code
 *
 * Uses dependency injection for external operations (git, spx test)
 * to enable unit testing without mocking.
 *
 * @param deps - Injected dependencies for external operations
 * @returns Result containing exit code and status
 *
 * @example
 * ```typescript
 * // Production usage
 * const result = await runPrecommitTests({
 *   getStagedFiles: async () => execGitDiffStaged(),
 *   runSpxTest: async (args) => execSpxTest(args),
 * });
 *
 * process.exit(result.exitCode);
 * ```
 */
export async function runPrecommitTests(
  deps: PrecommitDeps,
  config: PrecommitConfig = PRECOMMIT_DEFAULTS,
): Promise<PrecommitResult> {
  const log = deps.log ?? console.log;

  const stagedFiles = await deps.getStagedFiles();

  if (!shouldRunTests(stagedFiles, config)) {
    log(PRECOMMIT_RUN.MESSAGES.SKIPPING_NO_RELEVANT);
    return {
      skipped: true,
      exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
      message: PRECOMMIT_RUN.MESSAGES.SKIPPING_NO_RELEVANT,
    };
  }

  const relevantFiles = filterTestRelevantFiles(stagedFiles, config);
  const spxTestArgs = buildSpxTestArgs(relevantFiles, config);

  log(PRECOMMIT_RUN.MESSAGES.RUNNING_TESTS);
  const spxTestResult = await deps.runSpxTest(spxTestArgs);

  if (spxTestResult.exitCode === PRECOMMIT_RUN.EXIT_CODES.SUCCESS) {
    return {
      skipped: false,
      exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
      message: PRECOMMIT_RUN.MESSAGES.TESTS_PASSED,
      testOutput: spxTestResult.output,
    };
  }

  return {
    skipped: false,
    exitCode: spxTestResult.exitCode,
    message: PRECOMMIT_RUN.MESSAGES.TESTS_FAILED,
    testOutput: spxTestResult.output,
  };
}

// =============================================================================
// PRODUCTION IMPLEMENTATIONS
// =============================================================================

/**
 * Get staged files from git.
 * @returns Array of staged file paths
 */
async function getStagedFilesImpl(): Promise<string[]> {
  const { execSync } = await import("node:child_process");
  const output = execSync(PRECOMMIT_STAGED_FILES_COMMAND, {
    encoding: "utf-8",
  });
  return stagedFilesFromGitOutput(output);
}

/**
 * Run spx test with given arguments.
 * @param args - spx CLI arguments
 * @returns Result with exit code and output
 */
async function runSpxTestImpl(args: string[]): Promise<SpxTestResult> {
  const { spawnSync } = await import("node:child_process");
  const sourceDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const productRoot = resolve(sourceDir, "..");
  const cliPath = resolve(sourceDir, "cli.ts");
  const invocationDir = CONFIG_PROCESS_CWD.read();
  const result = spawnSync("npx", ["tsx", cliPath, "-C", invocationDir, ...args], {
    cwd: productRoot,
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  const output = combineTestProcessOutput(result.stdout, result.stderr);
  console.log(output);

  return {
    exitCode: result.status ?? 1,
    output,
  };
}

/**
 * Create production dependencies for pre-commit execution.
 */
export function createProductionDeps(): PrecommitDeps {
  return {
    getStagedFiles: getStagedFilesImpl,
    runSpxTest: runSpxTestImpl,
  };
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

/**
 * Main entry point for CLI invocation.
 * Called when running: npx tsx src/lib/precommit/run.ts
 */
async function main(): Promise<void> {
  const deps = createProductionDeps();
  const result = await runPrecommitTests(deps);
  process.exit(result.exitCode);
}

// Run if invoked directly
const isDirectExecution = typeof import.meta.url === "string"
  && isDirectPrecommitEntrypoint(
    import.meta.url,
    process.argv[1],
    PRECOMMIT_ENTRYPOINT.RUN,
  );

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error("Pre-commit hook failed:", error);
    process.exit(1);
  }
}
