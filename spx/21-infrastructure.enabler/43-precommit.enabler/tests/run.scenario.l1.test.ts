import { describe, expect, it } from "vitest";

import { PRECOMMIT_RUN, type PrecommitDeps, runPrecommitTests } from "@/lib/precommit/run";
import { VITEST_ARGS } from "@/lib/precommit/vitest-args";
import { PRECOMMIT_TEST_GENERATOR, samplePrecommitTestValue } from "@testing/generators/precommit/precommit";

const otherFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());
const sourceFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.sourcePath());
const testFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.testPath());

function createTestDeps(
  overrides: Partial<{
    stagedFiles: string[];
    vitestExitCode: number;
    vitestOutput: string;
  }> = {},
): { deps: PrecommitDeps; logs: string[] } {
  const {
    stagedFiles = [],
    vitestExitCode = PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
    vitestOutput = PRECOMMIT_RUN.MESSAGES.TESTS_PASSED,
  } = overrides;

  const logs: string[] = [];

  return {
    deps: {
      getStagedFiles: async () => stagedFiles,
      runVitest: async () => ({ exitCode: vitestExitCode, output: vitestOutput }),
      log: (message: string) => logs.push(message),
    },
    logs,
  };
}

describe("runPrecommitTests scenarios", () => {
  describe("GIVEN no relevant files staged", () => {
    it("WHEN running THEN skips with success exit code", async () => {
      const { deps } = createTestDeps({ stagedFiles: [otherFile(), otherFile()] });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(true);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.SKIPPING_NO_RELEVANT);
    });

    it("WHEN running THEN logs skip message", async () => {
      const { deps, logs } = createTestDeps({ stagedFiles: [otherFile()] });

      await runPrecommitTests(deps);

      expect(logs).toContain(PRECOMMIT_RUN.MESSAGES.SKIPPING_NO_RELEVANT);
    });
  });

  describe("GIVEN relevant files and tests pass", () => {
    it("WHEN running THEN returns success", async () => {
      const { deps } = createTestDeps({
        stagedFiles: [sourceFile()],
        vitestExitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
        vitestOutput: PRECOMMIT_RUN.MESSAGES.TESTS_PASSED,
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(false);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.TESTS_PASSED);
    });

    it("WHEN running THEN passes vitest output through to result", async () => {
      const expectedOutput = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());
      const { deps } = createTestDeps({
        stagedFiles: [sourceFile()],
        vitestExitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
        vitestOutput: expectedOutput,
      });

      const result = await runPrecommitTests(deps);

      expect(result.vitestOutput).toBe(expectedOutput);
    });

    it("WHEN running THEN logs running message", async () => {
      const { deps, logs } = createTestDeps({ stagedFiles: [sourceFile()] });

      await runPrecommitTests(deps);

      expect(logs).toContain(PRECOMMIT_RUN.MESSAGES.RUNNING_TESTS);
    });
  });

  describe("GIVEN relevant files and tests fail", () => {
    it("WHEN running THEN returns failure exit code", async () => {
      const { deps } = createTestDeps({
        stagedFiles: [testFile()],
        vitestExitCode: PRECOMMIT_RUN.EXIT_CODES.FAILURE,
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(false);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.FAILURE);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.TESTS_FAILED);
    });
  });

  describe("GIVEN test files staged", () => {
    it("WHEN running THEN calls runVitest with --run followed by those test files", async () => {
      const staged = testFile();
      let vitestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [staged],
        runVitest: async (args) => {
          vitestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(vitestArgs).toEqual([VITEST_ARGS.RUN, staged]);
    });
  });

  describe("GIVEN source files staged", () => {
    it("WHEN running THEN uses related --run followed by those source files", async () => {
      const staged = sourceFile();
      let vitestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [staged],
        runVitest: async (args) => {
          vitestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(vitestArgs).toEqual([VITEST_ARGS.RELATED, VITEST_ARGS.RUN, staged]);
    });
  });

  describe("GIVEN empty staged files", () => {
    it("WHEN running THEN skips with success", async () => {
      const { deps } = createTestDeps({ stagedFiles: [] });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(true);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
    });
  });
});
