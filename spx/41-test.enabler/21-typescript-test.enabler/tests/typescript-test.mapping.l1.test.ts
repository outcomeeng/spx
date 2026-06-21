import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  TYPESCRIPT_VITEST_EXCLUDE_FLAG_PREFIX,
  TYPESCRIPT_VITEST_EXCLUDE_FLAG_SUFFIX,
  typescriptTestingLanguage,
} from "@/test/languages/typescript";
import { TYPESCRIPT_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/typescript-runner";

describe("typescript test runner file matching and exclusion flags", () => {
  it("matches *.test.ts and *.test.tsx files as TypeScript test targets", () => {
    fc.assert(
      fc.property(TYPESCRIPT_RUNNER_TEST_GENERATOR.testFilePath(), (filePath) => {
        expect(typescriptTestingLanguage.matchesTestFile(filePath)).toBe(true);
      }),
    );
  });

  it("does not match files outside the TypeScript test-file patterns", () => {
    fc.assert(
      fc.property(TYPESCRIPT_RUNNER_TEST_GENERATOR.nonTestFilePath(), (filePath) => {
        expect(typescriptTestingLanguage.matchesTestFile(filePath)).toBe(false);
      }),
    );
  });

  it("maps an excluded node path to the vitest exclusion flag", () => {
    fc.assert(
      fc.property(TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePath(), (nodePath) => {
        expect(typescriptTestingLanguage.excludeFlag(nodePath)).toBe(
          `${TYPESCRIPT_VITEST_EXCLUDE_FLAG_PREFIX}${nodePath}${TYPESCRIPT_VITEST_EXCLUDE_FLAG_SUFFIX}`,
        );
      }),
    );
  });
});
