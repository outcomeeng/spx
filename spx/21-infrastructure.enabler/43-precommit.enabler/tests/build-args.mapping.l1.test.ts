import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES } from "@/config/index";
import {
  buildPrecommitTestInvocation,
  buildSpxTestArgs,
  buildVitestArgs,
  isTestFile,
  PRECOMMIT_TEST_RUNNERS,
} from "@/lib/precommit/build-args";
import { SPX_TEST_ARGS } from "@/lib/precommit/spx-test-args";
import { VITEST_ARGS } from "@/lib/precommit/vitest-args";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

const configFilePaths = Object.values(CONFIG_FILENAMES);

function expectedSpxChangedSetArgs(): string[] {
  return [
    SPX_TEST_ARGS.COMMAND,
    SPX_TEST_ARGS.CHANGED,
    SPX_TEST_ARGS.STAGED,
    SPX_TEST_ARGS.BASE,
    SPX_TEST_ARGS.BASE_REF,
  ];
}

describe("isTestFile", () => {
  it("returns true for any path containing the test pattern", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.testPath(), (path) => {
        expect(isTestFile(path)).toBe(true);
      }),
    );
  });

  it("returns false for any source file path", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.sourcePath(), (path) => {
        expect(isTestFile(path)).toBe(false);
      }),
    );
  });

  it("returns false for any other file path", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.otherPath(), (path) => {
        expect(isTestFile(path)).toBe(false);
      }),
    );
  });
});

describe("buildSpxTestArgs", () => {
  it("empty staged file list produces empty spx test argument list", () => {
    expect(buildSpxTestArgs([])).toEqual([]);
  });

  it("test-files-only input maps to changed-set testing against HEAD", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.testPath(), { minLength: 1 }), (testFiles) => {
        expect(buildSpxTestArgs(testFiles)).toEqual(expectedSpxChangedSetArgs());
      }),
    );
  });

  it("source-files-present input maps to changed-set testing against HEAD", () => {
    fc.assert(
      fc.property(
        fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }),
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath()),
        (sourceFiles, testFiles) => {
          expect(buildSpxTestArgs([...sourceFiles, ...testFiles])).toEqual(expectedSpxChangedSetArgs());
        },
      ),
    );
  });

  it("config-files-only input maps to changed-set testing against HEAD", () => {
    for (const path of configFilePaths) {
      expect(buildSpxTestArgs([path])).toEqual(expectedSpxChangedSetArgs());
    }
  });

  it("non-default config source files map to the operand runner", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.config().chain((config) =>
          fc
            .array(PRECOMMIT_TEST_GENERATOR.sourcePath(config), { minLength: 1, maxLength: 3 })
            .map((sourceFiles) => ({ config, sourceFiles }))
        ),
        ({ config, sourceFiles }) => {
          expect(buildVitestArgs(sourceFiles, config)).toEqual([
            VITEST_ARGS.RELATED,
            VITEST_ARGS.RUN,
            ...sourceFiles,
          ]);
          expect(buildPrecommitTestInvocation(sourceFiles, config)).toEqual({
            runner: PRECOMMIT_TEST_RUNNERS.VITEST,
            args: [VITEST_ARGS.RELATED, VITEST_ARGS.RUN, ...sourceFiles],
          });
        },
      ),
    );
  });

  it("non-default config mixed source and test files map to the operand runner", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.config().chain((config) =>
          fc
            .tuple(
              fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(config), { minLength: 1, maxLength: 3 }),
              fc.array(PRECOMMIT_TEST_GENERATOR.testPath(config), { minLength: 1, maxLength: 3 }),
            )
            .map(([sourceFiles, testFiles]) => ({ config, sourceFiles, testFiles }))
        ),
        ({ config, sourceFiles, testFiles }) => {
          const expectedArgs = [VITEST_ARGS.RELATED, VITEST_ARGS.RUN, ...sourceFiles, ...testFiles];
          const stagedFiles = [...sourceFiles, ...testFiles];

          expect(buildVitestArgs(stagedFiles, config)).toEqual(expectedArgs);
          expect(buildPrecommitTestInvocation(stagedFiles, config)).toEqual({
            runner: PRECOMMIT_TEST_RUNNERS.VITEST,
            args: expectedArgs,
          });
        },
      ),
    );
  });

  it("non-default config test files map to the operand runner when source files are absent", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.config().chain((config) =>
          fc
            .array(PRECOMMIT_TEST_GENERATOR.testPath(config), { minLength: 1, maxLength: 3 })
            .map((testFiles) => ({ config, testFiles }))
        ),
        ({ config, testFiles }) => {
          expect(buildVitestArgs(testFiles, config)).toEqual([VITEST_ARGS.RUN, ...testFiles]);
          expect(buildPrecommitTestInvocation(testFiles, config)).toEqual({
            runner: PRECOMMIT_TEST_RUNNERS.VITEST,
            args: [VITEST_ARGS.RUN, ...testFiles],
          });
        },
      ),
    );
  });

  it("non-default config product config files map to changed-set testing against HEAD", () => {
    fc.assert(
      fc.property(PRECOMMIT_TEST_GENERATOR.config(), (config) => {
        for (const path of configFilePaths) {
          expect(buildVitestArgs([path], config)).toEqual([]);
          expect(buildPrecommitTestInvocation([path], config).args).toEqual(expectedSpxChangedSetArgs());
        }
      }),
    );
  });

  it("non-default config mixed product config and source files map to changed-set testing against HEAD", () => {
    fc.assert(
      fc.property(
        PRECOMMIT_TEST_GENERATOR.config().chain((config) =>
          fc
            .tuple(fc.constantFrom(...configFilePaths), PRECOMMIT_TEST_GENERATOR.sourcePath(config))
            .map(([configPath, sourceFile]) => ({ config, configPath, sourceFile }))
        ),
        ({ config, configPath, sourceFile }) => {
          expect(buildPrecommitTestInvocation([configPath, sourceFile], config).args).toEqual(
            expectedSpxChangedSetArgs(),
          );
        },
      ),
    );
  });
});
