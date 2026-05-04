/**
 * Level 2 Integration Tests: Pre-Commit Test Enforcement
 *
 * These tests verify that lefthook and vitest work together to:
 * - Block commits when tests fail
 * - Allow commits when tests pass
 * - Skip tests for non-test-related files
 */
import { withGitEnv } from "@testing/harnesses/with-git-env";
import { describe, expect, it } from "vitest";

import { PRECOMMIT_TEST_GENERATOR, samplePrecommitTestValue } from "@testing/generators/precommit/precommit";

describe("Feature: Pre-Commit Test Enforcement", () => {
  describe("FI1: Pre-commit blocking behavior", () => {
    it("GIVEN staged changes with failing test WHEN committing THEN commit is blocked", async () => {
      await withGitEnv(async ({ exec, writeFile }) => {
        await writeFile(
          "src/math.ts",
          `export function add(a: number, b: number): number {
  return a + b;
}
`,
        );

        await writeFile(
          "spx/21-math.enabler/tests/math.test.ts",
          `import { expect, it } from "vitest";
import { add } from "../../../src/math.js";

it("intentionally fails to test pre-commit blocking", () => {
  expect(add(1, 1)).toBe(999);
});
`,
        );

        await exec("git add .");

        const result = await exec("git commit -m 'test commit'", { reject: false });

        expect(result.exitCode).not.toBe(0);
      });
    });

    it("GIVEN staged changes with passing test WHEN committing THEN commit succeeds", async () => {
      await withGitEnv(async ({ exec, writeFile }) => {
        await writeFile(
          "src/math.ts",
          `export function add(a: number, b: number): number {
  return a + b;
}
`,
        );

        await writeFile(
          "spx/21-math.enabler/tests/math.test.ts",
          `import { expect, it } from "vitest";
import { add } from "../../../src/math.js";

it("correctly tests addition", () => {
  expect(add(1, 1)).toBe(2);
});
`,
        );

        await exec("git add .");

        const result = await exec("git commit -m 'test commit'", { reject: false });

        expect(result.exitCode).toBe(0);
      });
    });
  });

  describe("FI2: Selective test execution", () => {
    it("GIVEN only non-test files staged WHEN committing THEN commit succeeds without running tests", async () => {
      await withGitEnv(async ({ exec, writeFile }) => {
        const otherPath = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.otherPath());

        await writeFile(otherPath, "# Test Project\n\nThis is a test.\n");
        await exec(`git add ${otherPath}`);

        const result = await exec("git commit -m 'docs: add readme'", { reject: false });

        expect(result.exitCode).toBe(0);
      });
    });
  });
});
