import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES } from "@/config/index";
import { PRECOMMIT_SPX_TEST_ARGS } from "@/lib/precommit/build-args";
import { combineTestProcessOutput, PRECOMMIT_RUN, type PrecommitDeps, runPrecommitTests } from "@/lib/precommit/run";
import { VITEST_ARGS } from "@/lib/precommit/vitest-args";
import { PRECOMMIT_TEST_GENERATOR, samplePrecommitTestValue } from "@testing/generators/precommit/precommit";

const otherFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());
const sourceFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.sourcePath());
const testFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.testPath());
const configFilePaths = Object.values(CONFIG_FILENAMES);

function createTestDeps(
  overrides: Partial<{
    stagedFiles: string[];
    testExitCode: number;
    testOutput: string;
  }> = {},
): { deps: PrecommitDeps; logs: string[] } {
  const {
    stagedFiles = [],
    testExitCode = PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
    testOutput = PRECOMMIT_RUN.MESSAGES.TESTS_PASSED,
  } = overrides;

  const logs: string[] = [];

  return {
    deps: {
      getStagedFiles: async () => stagedFiles,
      runSpxTest: async () => ({ exitCode: testExitCode, output: testOutput }),
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
        testExitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
        testOutput: PRECOMMIT_RUN.MESSAGES.TESTS_PASSED,
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(false);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.TESTS_PASSED);
    });

    it("WHEN running THEN passes spx test output through to result", async () => {
      const expectedOutput = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());
      const { deps } = createTestDeps({
        stagedFiles: [sourceFile()],
        testExitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS,
        testOutput: expectedOutput,
      });

      const result = await runPrecommitTests(deps);

      expect(result.testOutput).toBe(expectedOutput);
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
        testExitCode: PRECOMMIT_RUN.EXIT_CODES.FAILURE,
      });

      const result = await runPrecommitTests(deps);

      expect(result.skipped).toBe(false);
      expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.FAILURE);
      expect(result.message).toBe(PRECOMMIT_RUN.MESSAGES.TESTS_FAILED);
    });
  });

  describe("GIVEN test files staged", () => {
    it("WHEN running THEN calls spx test with changed-set arguments", async () => {
      const staged = testFile();
      let spxTestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [staged],
        runSpxTest: async (args) => {
          spxTestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
    });
  });

  describe("GIVEN source files staged", () => {
    it("WHEN running THEN calls spx test with changed-set arguments", async () => {
      const staged = sourceFile();
      let spxTestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [staged],
        runSpxTest: async (args) => {
          spxTestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
    });
  });

  describe("GIVEN product config files staged", () => {
    it("WHEN running THEN calls spx test with changed-set arguments", async () => {
      for (const path of configFilePaths) {
        let spxTestArgs: string[] = [];
        const deps: PrecommitDeps = {
          getStagedFiles: async () => [path],
          runSpxTest: async (args) => {
            spxTestArgs = args;
            return { exitCode: 0, output: "" };
          },
          log: () => {},
        };

        await runPrecommitTests(deps);

        expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
      }
    });
  });

  describe("GIVEN source and test files staged together", () => {
    it("WHEN running THEN calls spx test once with changed-set arguments", async () => {
      let spxTestCallCount = 0;
      let spxTestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [sourceFile(), testFile()],
        runSpxTest: async (args) => {
          spxTestCallCount += 1;
          spxTestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(spxTestCallCount).toBe(1);
      expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
    });
  });

  describe("GIVEN non-default precommit config", () => {
    it("WHEN custom source files are staged THEN calls the operand runner", async () => {
      const customConfig = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.config());
      const staged = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.sourcePath(customConfig));
      let spxTestCallCount = 0;
      let vitestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [staged],
        runSpxTest: async () => {
          spxTestCallCount += 1;
          return { exitCode: 0, output: "" };
        },
        runVitest: async (args) => {
          vitestArgs = args;
          return { exitCode: 0, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps, customConfig);

      expect(spxTestCallCount).toBe(0);
      expect(vitestArgs).toEqual([VITEST_ARGS.RELATED, VITEST_ARGS.RUN, staged]);
    });

    it("WHEN product config files are staged THEN calls spx test with changed-set arguments", async () => {
      const customConfig = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.config());
      for (const staged of configFilePaths) {
        let spxTestArgs: string[] = [];
        let vitestCallCount = 0;
        const expectedExitCode = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.exitCode());
        const deps: PrecommitDeps = {
          getStagedFiles: async () => [staged],
          runSpxTest: async (args) => {
            spxTestArgs = args;
            return { exitCode: expectedExitCode, output: "" };
          },
          runVitest: async () => {
            vitestCallCount += 1;
            return { exitCode: 0, output: "" };
          },
          log: () => {},
        };

        const result = await runPrecommitTests(deps, customConfig);

        expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
        expect(result.exitCode).toBe(expectedExitCode);
        expect(vitestCallCount).toBe(0);
      }
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

describe("combineTestProcessOutput scenarios", () => {
  it("returns an empty string when spawnSync produces no captured output", () => {
    expect(combineTestProcessOutput(undefined, undefined)).toHaveLength(0);
  });
});
