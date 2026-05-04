import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildVitestArgs, isTestFile, VITEST_ARGS } from "@/lib/precommit/build-args";
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

  it("test-files-only input: first arg is --run, all test files are included, no RELATED prefix", () => {
    fc.assert(
      fc.property(fc.array(PRECOMMIT_TEST_GENERATOR.testPath(), { minLength: 1 }), (testFiles) => {
        const args = buildVitestArgs(testFiles);
        expect(args[0]).toBe(VITEST_ARGS.RUN);
        expect(args).not.toContain(VITEST_ARGS.RELATED);
        for (const f of testFiles) expect(args).toContain(f);
      }),
    );
  });

  it("source-files-present input: starts with related --run, contains all source files, no test files", () => {
    fc.assert(
      fc.property(
        fc.array(PRECOMMIT_TEST_GENERATOR.sourcePath(), { minLength: 1 }),
        fc.array(PRECOMMIT_TEST_GENERATOR.testPath()),
        (sourceFiles, testFiles) => {
          const args = buildVitestArgs([...sourceFiles, ...testFiles]);
          expect(args[0]).toBe(VITEST_ARGS.RELATED);
          expect(args[1]).toBe(VITEST_ARGS.RUN);
          for (const f of sourceFiles) expect(args).toContain(f);
          for (const f of testFiles) expect(args).not.toContain(f);
        },
      ),
    );
  });
});
