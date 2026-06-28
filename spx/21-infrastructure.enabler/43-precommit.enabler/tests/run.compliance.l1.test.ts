import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES } from "@/config/index";
import {
  GIT_COPY_STATUS_EXAMPLE,
  GIT_DELETE_STATUS_EXAMPLE,
  GIT_NAME_STATUS_FLAG,
  GIT_NULL_DELIMITED_FLAG,
  GIT_RENAME_STATUS_EXAMPLE,
  GIT_RENAMED_PATH_SUFFIX,
} from "@/lib/git/name-status";
import { PRECOMMIT_SPX_TEST_ARGS } from "@/lib/precommit/build-args";
import {
  PRECOMMIT_RUN,
  PRECOMMIT_STAGED_FILES_COMMAND,
  PRECOMMIT_STAGED_FILES_EXCLUDED_DIFF_FILTER_FLAG,
  type PrecommitDeps,
  runPrecommitTests,
  shouldRunTests,
  stagedFilesFromGitOutput,
} from "@/lib/precommit/run";
import { VITEST_ARGS } from "@/lib/precommit/vitest-args";
import { compareAsciiStrings } from "@/lib/state-store";
import { PRECOMMIT_TEST_GENERATOR, samplePrecommitTestValue } from "@testing/generators/precommit/precommit";

const otherFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());
const sourceFile = () => samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.sourcePath());
const configFilePaths = Object.values(CONFIG_FILENAMES);

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

  it("returns true when a product config file is present", () => {
    for (const path of configFilePaths) {
      expect(shouldRunTests([path])).toBe(true);
    }
  });
});

describe("runPrecommitTests compliance", () => {
  it("enumerates staged paths without filtering out deleted or renamed files", () => {
    const pathSpace = String.fromCodePoint(32);
    const pathTab = String.fromCodePoint(9);
    const pathNewline = String.fromCodePoint(10);
    const oldPath = `${pathSpace}${sourceFile()}${pathTab}`;
    const newPath = `${sourceFile()}${GIT_RENAMED_PATH_SUFFIX}${pathNewline}${pathSpace}`;
    const copiedPath = `${sourceFile()}.copied`;
    const deletedPath = sourceFile();

    expect(PRECOMMIT_STAGED_FILES_COMMAND).toContain(GIT_NAME_STATUS_FLAG);
    expect(PRECOMMIT_STAGED_FILES_COMMAND).toContain(GIT_NULL_DELIMITED_FLAG);
    expect(PRECOMMIT_STAGED_FILES_COMMAND).not.toContain(PRECOMMIT_STAGED_FILES_EXCLUDED_DIFF_FILTER_FLAG);
    expect(
      stagedFilesFromGitOutput(
        `${GIT_RENAME_STATUS_EXAMPLE}\0${oldPath}\0${newPath}\0${GIT_COPY_STATUS_EXAMPLE}\0${oldPath}\0${copiedPath}\0${GIT_DELETE_STATUS_EXAMPLE}\0${deletedPath}\0`,
      ),
    ).toEqual([copiedPath, deletedPath, oldPath, newPath].sort(compareAsciiStrings));
  });

  it("exits zero when no test-relevant files are staged", async () => {
    const deps: PrecommitDeps = {
      getStagedFiles: async () => [otherFile(), otherFile()],
      runSpxTest: async () => ({ exitCode: PRECOMMIT_RUN.EXIT_CODES.FAILURE, output: "" }),
      log: () => {},
    };

    const result = await runPrecommitTests(deps);

    expect(result.exitCode).toBe(PRECOMMIT_RUN.EXIT_CODES.SUCCESS);
    expect(result.skipped).toBe(true);
  });

  it("does not invoke spx test when no test-relevant files are staged", async () => {
    let spxTestCalled = false;
    const deps: PrecommitDeps = {
      getStagedFiles: async () => [otherFile()],
      runSpxTest: async () => {
        spxTestCalled = true;
        return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
      },
      log: () => {},
    };

    await runPrecommitTests(deps);

    expect(spxTestCalled).toBe(false);
  });

  it("propagates the spx test process exit code", async () => {
    const testExitCode = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.exitCode());
    const deps: PrecommitDeps = {
      getStagedFiles: async () => [sourceFile()],
      runSpxTest: async () => ({ exitCode: testExitCode, output: "" }),
      log: () => {},
    };

    const result = await runPrecommitTests(deps);

    expect(result.exitCode).toBe(testExitCode);
  });

  it("passes changed-set arguments to spx test when source files are staged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }),
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath()),
        fc.array(PRECOMMIT_TEST_GENERATOR.otherPath(), { minLength: 1 }),
        async (sourceFiles, testFiles, otherFiles) => {
          let spxTestArgs: string[] = [];
          const deps: PrecommitDeps = {
            getStagedFiles: async () => [...sourceFiles, ...testFiles, ...otherFiles],
            runSpxTest: async (args) => {
              spxTestArgs = args;
              return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
            },
            log: () => {},
          };

          await runPrecommitTests(deps);

          expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
        },
      ),
    );
  });

  it("passes changed-set arguments to spx test when no source files are staged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath(), { minLength: 1 }),
        fc.array(PRECOMMIT_TEST_GENERATOR.otherPath(), { minLength: 1 }),
        async (testFiles, otherFiles) => {
          let spxTestArgs: string[] = [];
          const deps: PrecommitDeps = {
            getStagedFiles: async () => [...testFiles, ...otherFiles],
            runSpxTest: async (args) => {
              spxTestArgs = args;
              return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
            },
            log: () => {},
          };

          await runPrecommitTests(deps);

          expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
        },
      ),
    );
  });

  it("passes changed-set arguments to spx test when only product config files are staged", async () => {
    for (const path of configFilePaths) {
      let spxTestArgs: string[] = [];
      const deps: PrecommitDeps = {
        getStagedFiles: async () => [path],
        runSpxTest: async (args) => {
          spxTestArgs = args;
          return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
        },
        log: () => {},
      };

      await runPrecommitTests(deps);

      expect(spxTestArgs).toEqual(PRECOMMIT_SPX_TEST_ARGS);
    }
  });

  it("routes non-default precommit config through the operand runner", async () => {
    const customConfig = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.config());
    const customSource = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.sourcePath(customConfig));
    let spxTestCalled = false;
    let vitestArgs: string[] = [];
    const deps: PrecommitDeps = {
      getStagedFiles: async () => [customSource],
      runSpxTest: async () => {
        spxTestCalled = true;
        return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
      },
      runVitest: async (args) => {
        vitestArgs = args;
        return { exitCode: PRECOMMIT_RUN.EXIT_CODES.SUCCESS, output: "" };
      },
      log: () => {},
    };

    await runPrecommitTests(deps, customConfig);

    expect(spxTestCalled).toBe(false);
    expect(vitestArgs).toEqual([VITEST_ARGS.RELATED, VITEST_ARGS.RUN, customSource]);
  });
});
