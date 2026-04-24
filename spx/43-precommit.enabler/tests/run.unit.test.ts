/**
 * Unit tests for pre-commit test orchestration.
 *
 * Test Levels:
 *
 * Level 1 (Unit):
 * - shouldRunTests() pure function logic
 * - runPrecommitTests() orchestration with injected dependencies
 *
 * ESCALATION 1 → 2:
 * Level 1 proves the orchestration logic is correct with controlled
 * dependencies, but cannot verify that actual git and vitest commands
 * work correctly. Level 2 (feature integration) tests real execution.
 */

import { PRECOMMIT_RUN, type PrecommitDeps, runPrecommitTests, shouldRunTests } from "@/precommit/run.js";
import { describe, expect, it } from "vitest";

// =============================================================================
// shouldRunTests - Pure Function Tests
// =============================================================================

describe("shouldRunTests", () => {
  describe("GIVEN test files in list", () => {
    it("WHEN checking THEN returns true", () => {
      const files = ["tests/unit/foo.test.ts"];

      const result = shouldRunTests(files);

      expect(result).toBe(true);
    });

    it("WHEN checking integration tests THEN returns true", () => {
      const files = ["tests/integration/bar.integration.test.ts"];

      const result = shouldRunTests(files);

      expect(result).toBe(true);
    });

    it("WHEN checking spec tests THEN returns true", () => {
      const files = ["specs/work/doing/cap-1/tests/baz.test.ts"];

      const result = shouldRunTests(files);

      expect(result).toBe(true);
    });
  });

  describe("GIVEN source files in list", () => {
    it("WHEN checking THEN returns true", () => {
      const files = ["src/validation/runner.ts"];

      const result = shouldRunTests(files);

      expect(result).toBe(true);
    });

    it("WHEN checking nested source files THEN returns true", () => {
      const files = ["src/commands/validation/all.ts"];

      const result = shouldRunTests(files);

      expect(result).toBe(true);
    });
  });

  describe("GIVEN only non-relevant files", () => {
    it("WHEN checking docs THEN returns false", () => {
      const files = ["README.md", "docs/testing/standards.md"];

      const result = shouldRunTests(files);

      expect(result).toBe(false);
    });

    it("WHEN checking config files THEN returns false", () => {
      const files = ["package.json", "tsconfig.json", ".gitignore"];

      const result = shouldRunTests(files);

      expect(result).toBe(false);
    });

    it("WHEN checking mixed non-relevant files THEN returns false", () => {
      const files = ["README.md", "package.json", ".eslintrc.js"];

      const result = shouldRunTests(files);

      expect(result).toBe(false);
    });
  });

  describe("GIVEN empty list", () => {
    it("WHEN checking THEN returns false", () => {
      const result = shouldRunTests([]);

      expect(result).toBe(false);
    });
  });

  describe("GIVEN mixed relevant and non-relevant files", () => {
    it("WHEN checking THEN returns true", () => {
      const files = ["README.md", "src/validation/runner.ts", "package.json"];

      const result = shouldRunTests(files);

      expect(result).toBe(true);
    });
  });
});

// =============================================================================
// runPrecommitTests - Orchestration Tests with Dependency Injection
// =============================================================================

/**
 * Creates test dependencies with controlled behavior.
 * Uses real implementations, not mocks - behavior is controlled via parameters.
 */
function createTestDeps(
  overrides: Partial<{
    stagedFiles: string[];
    vitestExitCode: number;
    vitestOutput: string;
  }> = {},
): {
  deps: PrecommitDeps;
  logs: string[];
} {
  const {
    stagedFiles = [],
    vitestExitCode = PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
    vitestOutput = "All tests passed",
  } = overrides;

  const logs: string[] = [];

  const deps: PrecommitDeps = {
    getStagedFiles: async () => stagedFiles,
    runVitest: async () => ({
      exitCode: vitestExitCode,
      output: vitestOutput,
    }),
    log: (message: string) => logs.push(message),
  };

  return { deps, logs };
}

describe("runPrecommitTests", () => {
  describe("GIVEN no relevant files staged", () => {
    it("WHEN running THEN skips with success exit code", async () => {
      const { deps } = createTestDeps({
        stagedFiles: ["README.md", "package.json"],
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(true);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.SKIPPING_NO_RELEVANT);
    });

    it("WHEN running THEN logs skip message", async () => {
      const { deps, logs } = createTestDeps({
        stagedFiles: ["README.md"],
      });

      await runPrecommitTests(deps);

      expect(logs).toContain(PRECOMMIT_RUN.MESSAGES.SKIPPING_NO_RELEVANT);
    });

    it("WHEN running THEN does not call runVitest", async () => {
      let vitestCalled = false;
      const deps: PrecommitDeps = {
        getStagedFiles: async () => ["README.md"],
        runVitest: async () => {
          vitestCalled = true;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(vitestCalled).toBe(false);
    });
  });

  describe("GIVEN relevant files and tests pass", () => {
    it("WHEN running THEN returns success", async () => {
      const { deps } = createTestDeps({
        stagedFiles: ["src/foo.ts"],
        vitestExitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
        vitestOutput: "All tests passed",
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(false);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.TESTS_PASSED);
    });

    it("WHEN running THEN includes vitest output", async () => {
      const expectedOutput = "Test output here";
      const { deps } = createTestDeps({
        stagedFiles: ["src/foo.ts"],
        vitestExitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
        vitestOutput: expectedOutput,
      });

      const result = await runPrecommitTests(deps);

      expect(result.vitestOutput).toBe(expectedOutput);
    });

    it("WHEN running THEN logs running message", async () => {
      const { deps, logs } = createTestDeps({
        stagedFiles: ["src/foo.ts"],
      });

      await runPrecommitTests(deps);

      expect(logs).toContain(PRECOMMIT_RUN.MESSAGES.RUNNING_TESTS);
    });
  });

  describe("GIVEN relevant files and tests fail", () => {
    it("WHEN running THEN returns failure exit code", async () => {
      const { deps } = createTestDeps({
        stagedFiles: ["tests/unit/foo.test.ts"],
        vitestExitCode: PRECOMMIT_RUN.EXIT_CODES.FAILURE,
        vitestOutput: "1 test failed",
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(false);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.FAILURE);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.TESTS_FAILED);
    });

    it("WHEN running THEN includes vitest output for debugging", async () => {
      const errorOutput = "FAIL tests/unit/foo.test.ts\n  Expected 1 but got 2";
      const { deps } = createTestDeps({
        stagedFiles: ["tests/unit/foo.test.ts"],
        vitestExitCode: PRECOMMIT_RUN.EXIT_CODES.FAILURE,
        vitestOutput: errorOutput,
      });

      const result = await runPrecommitTests(deps);

      expect(result.vitestOutput).toBe(errorOutput);
    });

    it("WHEN vitest returns non-1 failure code THEN preserves exit code", async () => {
      const { deps } = createTestDeps({
        stagedFiles: ["src/foo.ts"],
        vitestExitCode: 2, // Different non-zero exit code
        vitestOutput: "Vitest error",
      });

      const result = await runPrecommitTests(deps);

      expect(result.exitCode).toBe(2);
    });
  });

  describe("GIVEN test files staged", () => {
    it("WHEN running THEN calls runVitest", async () => {
      let vitestCalled = false;
      let vitestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => ["tests/unit/foo.test.ts"],
        runVitest: async (args) => {
          vitestCalled = true;
          vitestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(vitestCalled).toBe(true);
      // Verify --run flag is included (from buildVitestArgs)
      expect(vitestArgs).toContain("--run");
    });
  });

  describe("GIVEN source files staged", () => {
    it("WHEN running THEN uses vitest related subcommand", async () => {
      let vitestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => ["src/validation/runner.ts"],
        runVitest: async (args) => {
          vitestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(vitestArgs).toContain("related");
      expect(vitestArgs).toContain("src/validation/runner.ts");
    });
  });

  describe("GIVEN empty staged files", () => {
    it("WHEN running THEN skips with success", async () => {
      const { deps } = createTestDeps({
        stagedFiles: [],
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(true);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
    });
  });
});
