import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES } from "@/config/index";
import { buildSpxTestArgs, isTestFile } from "@/lib/precommit/build-args";
import { SPX_TEST_ARGS } from "@/lib/precommit/spx-test-args";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

const configFilePaths = Object.values(CONFIG_FILENAMES);

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
        expect(buildSpxTestArgs(testFiles)).toEqual([
          SPX_TEST_ARGS.COMMAND,
          SPX_TEST_ARGS.CHANGED,
          SPX_TEST_ARGS.STAGED,
          SPX_TEST_ARGS.BASE,
          SPX_TEST_ARGS.BASE_REF,
        ]);
      }),
    );
  });

  it("source-files-present input maps to changed-set testing against HEAD", () => {
    fc.assert(
      fc.property(
        fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }),
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath()),
        (sourceFiles, testFiles) => {
          expect(buildSpxTestArgs([...sourceFiles, ...testFiles])).toEqual([
            SPX_TEST_ARGS.COMMAND,
            SPX_TEST_ARGS.CHANGED,
            SPX_TEST_ARGS.STAGED,
            SPX_TEST_ARGS.BASE,
            SPX_TEST_ARGS.BASE_REF,
          ]);
        },
      ),
    );
  });

  it("config-files-only input maps to changed-set testing against HEAD", () => {
    for (const path of configFilePaths) {
      expect(buildSpxTestArgs([path])).toEqual([
        SPX_TEST_ARGS.COMMAND,
        SPX_TEST_ARGS.CHANGED,
        SPX_TEST_ARGS.STAGED,
        SPX_TEST_ARGS.BASE,
        SPX_TEST_ARGS.BASE_REF,
      ]);
    }
  });
});
