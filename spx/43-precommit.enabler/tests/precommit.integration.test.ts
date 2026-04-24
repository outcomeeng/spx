/**
 * Level 2 Integration Tests: Pre-Commit Test Enforcement
 *
 * These tests verify that lefthook and vitest work together to:
 * - Block commits when tests fail
 * - Allow commits when tests pass
 * - Skip tests for non-test-related files
 *
 * @see specs/work/doing/capability-15_infrastructure/feature-65_precommit-test-enforcement/precommit-test-enforcement.feature.md
 */
import { withGitEnv } from "@test/harness/with-git-env";
import { describe, expect, it } from "vitest";

/** Timeout for git+lefthook+vitest integration tests */
const GIT_INTEGRATION_TIMEOUT = 30_000;

describe("Feature: Pre-Commit Test Enforcement", () => {
  describe("FI1: Pre-commit blocking behavior", () => {
    it(
      "GIVEN staged changes with failing test WHEN committing THEN commit is blocked",
      { timeout: GIT_INTEGRATION_TIMEOUT },
      async () => {
        await withGitEnv(async ({ exec, writeFile }) => {
          // Given: Source file and failing test
          await writeFile(
            "src/math.ts",
            `export function add(a: number, b: number): number {
  return a + b;
}
`,
          );

          await writeFile(
            "tests/math.test.ts",
            `import { expect, it } from "vitest";
import { add } from "../src/math.js";

it("intentionally fails to test pre-commit blocking", () => {
  expect(add(1, 1)).toBe(999); // Wrong expectation
});
`,
          );

          // Stage files
          await exec("git add .");

          // When: Attempt to commit
          const result = await exec("git commit -m 'test commit'", {
            reject: false,
          });

          // Then: Commit is blocked (non-zero exit code)
          expect(result.exitCode).not.toBe(0);
        });
      },
    );

    it("GIVEN staged changes with passing test WHEN committing THEN commit succeeds", {
      timeout: GIT_INTEGRATION_TIMEOUT,
    }, async () => {
      await withGitEnv(async ({ exec, writeFile }) => {
        // Given: Source file and passing test
        await writeFile(
          "src/math.ts",
          `export function add(a: number, b: number): number {
  return a + b;
}
`,
        );

        await writeFile(
          "tests/math.test.ts",
          `import { expect, it } from "vitest";
import { add } from "../src/math.js";

it("correctly tests addition", () => {
  expect(add(1, 1)).toBe(2);
});
`,
        );

        // Stage files
        await exec("git add .");

        // When: Commit
        const result = await exec("git commit -m 'test commit'", {
          reject: false,
        });

        // Then: Commit succeeds
        expect(result.exitCode).toBe(0);
      });
    });
  });

  describe("FI2: Selective test execution", () => {
    it("GIVEN only non-test files staged WHEN committing THEN commit succeeds without running tests", {
      timeout: GIT_INTEGRATION_TIMEOUT,
    }, async () => {
      await withGitEnv(async ({ exec, writeFile }) => {
        // Given: Only a README file (no ts files that would trigger tests)
        await writeFile("README.md", "# Test Project\n\nThis is a test.\n");

        // Stage only README
        await exec("git add README.md");

        // When: Commit
        const result = await exec("git commit -m 'docs: add readme'", {
          reject: false,
        });

        // Then: Commit succeeds (no tests triggered by non-ts file)
        expect(result.exitCode).toBe(0);
      });
    });
  });
});
