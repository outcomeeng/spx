import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildVitestArgs, isTestFile } from "@/lib/precommit/build-args";
import { VITEST_ARGS } from "@/lib/precommit/vitest-args";
import { PRECOMMIT_TEST_GENERATOR } from "@testing/generators/precommit/precommit";

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

describe("buildVitestArgs", () => {
  it("empty staged file list produces empty vitest argument list", () => {
    expect(buildVitestArgs([])).toEqual([]);
  });

  it("test-files-only input maps exactly to --run followed by the test files", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.testPath(), { minLength: 1 }), (testFiles) => {
        expect(buildVitestArgs(testFiles)).toEqual([VITEST_ARGS.RUN, ...testFiles]);
      }),
    );
  });

  it("source-files-present input maps exactly to related --run followed by the source files", () => {
    fc.assert(
      fc.property(
        fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }),
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath()),
        (sourceFiles, testFiles) => {
          expect(buildVitestArgs([...sourceFiles, ...testFiles])).toEqual([
            VITEST_ARGS.RELATED,
            VITEST_ARGS.RUN,
            ...sourceFiles,
          ]);
        },
      ),
    );
  });
});
