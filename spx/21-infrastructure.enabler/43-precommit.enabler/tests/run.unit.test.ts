import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VITEST_ARGS } from "@/lib/precommit/build-args";
import { PRECOMMIT_RUN, type PrecommitDeps, runPrecommitTests, shouldRunTests } from "@/lib/precommit/run";
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

describe("shouldRunTests", () => {
  it("returns true when any test file is present", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.testPath(), { minLength: 1 }), (files) => {
        expect(shouldRunTests(files)).toBe(true);
      }),
    );
  });

  it("returns true when any source file is present", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }), (files) => {
        expect(shouldRunTests(files)).toBe(true);
      }),
    );
  });

  it("returns false when only other files are present", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.otherPath(), { minLength: 1 }), (files) => {
        expect(shouldRunTests(files)).toBe(false);
      }),
    );
  });

  it("returns false for empty list", () => {
    expect(shouldRunTests([])).toBe(false);
  });
});

describe("runPrecommitTests", () => {
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

    it("WHEN running THEN does not call runVitest", async () => {
      let vitestCalled = false;
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [otherFile()],
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

    it("WHEN running THEN preserves non-1 vitest exit code", async () => {
      const { deps } = createTestDeps({
        stagedFiles: [sourceFile()],
        vitestExitCode: 2,
      });

      const result = await runPrecommitTests(deps);

      expect(result.exitCode).toBe(2);
    });
  });

  describe("GIVEN test files staged", () => {
    it("WHEN running THEN calls runVitest with --run flag", async () => {
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

      expect(vitestArgs).toContain(VITEST_ARGS.RUN);
    });
  });

  describe("GIVEN source files staged", () => {
    it("WHEN running THEN uses vitest related subcommand", async () => {
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

      expect(vitestArgs).toContain(VITEST_ARGS.RELATED);
      expect(vitestArgs).toContain(staged);
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
