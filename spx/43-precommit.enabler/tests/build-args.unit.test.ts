/**
 * Level 1: Unit tests for buildVitestArgs function
 * Story: story-32_lefthook-config
 *
 * Tests the pure function that builds vitest CLI arguments from staged files.
 * Uses constants from implementation (DRY pattern) rather than literal strings.
 */

import { describe, expect, it } from "vitest";

import { buildVitestArgs, isTestFile, VITEST_ARGS } from "@/lib/precommit/build-args";

describe("isTestFile", () => {
  it("GIVEN .test.ts file WHEN checking THEN returns true", () => {
    expect(isTestFile("spx/foo.enabler/tests/foo.test.ts")).toBe(true);
  });

  it("GIVEN source .ts file WHEN checking THEN returns false", () => {
    expect(isTestFile("src/foo.ts")).toBe(false);
  });

  it("GIVEN source .tsx file WHEN checking THEN returns false", () => {
    expect(isTestFile("src/component.tsx")).toBe(false);
  });
});

describe("buildVitestArgs", () => {
  describe("test file detection", () => {
    it("a path containing the test pattern is classified as a test file", () => {
      expect(isTestFile("spx/foo.enabler/tests/foo.test.ts")).toBe(true);
      expect(isTestFile("src/foo.ts")).toBe(false);
    });
  });

  describe("empty input", () => {
    it("GIVEN empty files WHEN building args THEN returns empty array", () => {
      const args = buildVitestArgs([]);

      expect(args).toEqual([]);
    });
  });

  describe("test files only", () => {
    it("GIVEN test files WHEN building args THEN includes --run and file paths", () => {
      const files = ["tests/unit/foo.test.ts", "tests/unit/bar.test.ts"];

      const args = buildVitestArgs(files);

      expect(args).toContain(VITEST_ARGS.RUN);
      expect(args).toContain(files[0]);
      expect(args).toContain(files[1]);
    });

    it("GIVEN single test file WHEN building args THEN returns correct array", () => {
      const file = "tests/unit/foo.test.ts";
      const args = buildVitestArgs([file]);

      expect(args).toEqual([VITEST_ARGS.RUN, file]);
    });
  });

  describe("source files only", () => {
    it("GIVEN source files WHEN building args THEN uses vitest related", () => {
      // Uses `vitest related` subcommand to run only tests covering these files
      const files = ["src/validation/runner.ts"];

      const args = buildVitestArgs(files);

      expect(args).toEqual([VITEST_ARGS.RELATED, VITEST_ARGS.RUN, "src/validation/runner.ts"]);
    });

    it("GIVEN multiple source files WHEN building args THEN includes all source files", () => {
      const files = ["src/foo.ts", "src/bar.ts", "src/baz.ts"];

      const args = buildVitestArgs(files);

      expect(args).toEqual([VITEST_ARGS.RELATED, VITEST_ARGS.RUN, "src/foo.ts", "src/bar.ts", "src/baz.ts"]);
    });
  });

  describe("mixed files", () => {
    it("GIVEN mixed files WHEN building args THEN uses vitest related with source files only", () => {
      // When source files are present, use `vitest related` with only the source files
      // (vitest will find related tests automatically)
      const files = ["src/foo.ts", "tests/unit/bar.test.ts"];

      const args = buildVitestArgs(files);

      expect(args).toEqual([VITEST_ARGS.RELATED, VITEST_ARGS.RUN, "src/foo.ts"]);
    });

    it("GIVEN multiple mixed files WHEN building args THEN includes only source files", () => {
      const files = [
        "src/validation/runner.ts",
        "src/scanner/walk.ts",
        "tests/unit/scanner/walk.test.ts",
      ];

      const args = buildVitestArgs(files);

      expect(args).toEqual([VITEST_ARGS.RELATED, VITEST_ARGS.RUN, "src/validation/runner.ts", "src/scanner/walk.ts"]);
    });
  });

  describe("argument order", () => {
    it("GIVEN test files WHEN building args THEN --run comes first", () => {
      const args = buildVitestArgs(["tests/unit/foo.test.ts"]);

      expect(args[0]).toBe(VITEST_ARGS.RUN);
    });

    it("GIVEN test files WHEN building args THEN files come after --run", () => {
      const args = buildVitestArgs(["tests/unit/foo.test.ts"]);

      expect(args).toEqual([VITEST_ARGS.RUN, "tests/unit/foo.test.ts"]);
    });
  });
});
