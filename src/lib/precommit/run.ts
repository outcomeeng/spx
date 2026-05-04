/**
 * Pre-commit test orchestration for vitest integration.
 *
 * Coordinates test execution during pre-commit hooks:
 * - Determines if tests should run based on staged files
 * - Executes vitest with appropriate arguments
 * - Provides clear output on test results
 *
 * Uses dependency injection for subprocess calls to enable unit testing.
 *
 * @module precommit/run
 */

import { buildVitestArgs } from "./build-args";
import { filterTestRelevantFiles } from "./categorize";
import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "./config";

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

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of running vitest.
 */
export interface VitestResult {
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
   * Run vitest with the given arguments.
   * @param args - Vitest CLI arguments
   * @returns Result containing exit code and output
   */
  runVitest: (args: string[]) => Promise<VitestResult>;

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
  /** Vitest output if tests were run */
  vitestOutput?: string;
}

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

// =============================================================================
// ORCHESTRATION
// =============================================================================

/**
 * Run pre-commit tests.
 *
 * Orchestrates the complete pre-commit test workflow:
 * 1. Get staged files from git
 * 2. Determine if tests should run
 * 3. If relevant files exist, run vitest
 * 4. Return result with appropriate exit code
 *
 * Uses dependency injection for external operations (git, vitest)
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
 *   runVitest: async (args) => execVitest(args),
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
  const vitestArgs = buildVitestArgs(relevantFiles, config);

  // Run vitest
  log(PRECOMMIT_RUN.MESSAGES.RUNNING_TESTS);
  const vitestResult = await deps.runVitest(vitestArgs);

  // Determine result
  if (vitestResult.exitCode === PRECOMMIT_RUN.EXIT_CODES.SUCCESS) {
    return {
      skipped: false,
      exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
      message: PRECOMMIT_RUN.MESSAGES.TESTS_PASSED,
      vitestOutput: vitestResult.output,
    };
  }

  return {
    skipped: false,
    exitCode: vitestResult.exitCode,
    message: PRECOMMIT_RUN.MESSAGES.TESTS_FAILED,
    vitestOutput: vitestResult.output,
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
  const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
    encoding: "utf-8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Run vitest with given arguments.
 * @param args - Vitest CLI arguments
 * @returns Result with exit code and output
 */
async function runVitestImpl(args: string[]): Promise<VitestResult> {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("npx", ["vitest", ...args], {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  const output = (result.stdout ?? "") + (result.stderr ?? "");
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
    runVitest: runVitestImpl,
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
  && import.meta.url.endsWith("/run.ts")
  && process.argv[1]?.includes("precommit/run");

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error("Pre-commit hook failed:", error);
    process.exit(1);
  }
}
