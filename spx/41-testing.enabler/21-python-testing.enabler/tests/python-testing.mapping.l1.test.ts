import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  PYTHON_PYTEST_IGNORE_FLAG_PREFIX,
  PYTHON_PYTEST_IGNORE_FLAG_SUFFIX,
  pythonTestingLanguage,
} from "@/testing/languages/python";
import { PYTHON_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/python-runner";

describe("python test runner file matching and exclusion flags", () => {
  it("matches test_*.py files as Python test targets", () => {
    fc.assert(
      fc.property(PYTHON_RUNNER_TEST_GENERATOR.testFilePath(), (filePath) => {
        expect(pythonTestingLanguage.matchesTestFile(filePath)).toBe(true);
      }),
    );
  });

  it("does not match files outside the Python test-file pattern", () => {
    fc.assert(
      fc.property(PYTHON_RUNNER_TEST_GENERATOR.nonTestFilePath(), (filePath) => {
        expect(pythonTestingLanguage.matchesTestFile(filePath)).toBe(false);
      }),
    );
  });

  it("maps an excluded node path to the pytest ignore flag", () => {
    fc.assert(
      fc.property(PYTHON_RUNNER_TEST_GENERATOR.nodePath(), (nodePath) => {
        expect(pythonTestingLanguage.excludeFlag(nodePath)).toBe(
          `${PYTHON_PYTEST_IGNORE_FLAG_PREFIX}${nodePath}${PYTHON_PYTEST_IGNORE_FLAG_SUFFIX}`,
        );
      }),
    );
  });
});
