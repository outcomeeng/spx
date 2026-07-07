import {
  assertPrecommitAllowsFailingTestWithoutRunningTests,
  assertPrecommitAllowsStagedCodeWithUnstagedOtherFile,
  assertPrecommitRunsFixtureExclusionCheckForMatchingFiles,
  assertPrecommitSkipsTestsForNonFixtureFiles,
} from "@testing/harnesses/precommit/scenarios";
import { describe, expect, it } from "vitest";

describe("Pre-Commit Test Enforcement", () => {
  describe("FI1: Minimal pre-commit behavior", () => {
    it("GIVEN staged changes with failing test WHEN committing THEN commit succeeds without running tests", async () => {
      await expect(assertPrecommitAllowsFailingTestWithoutRunningTests()).resolves.toBeUndefined();
    });

    it("GIVEN staged code and unrelated unstaged non-test file WHEN committing THEN commit succeeds", async () => {
      await expect(assertPrecommitAllowsStagedCodeWithUnstagedOtherFile()).resolves.toBeUndefined();
    });
  });

  describe("FI2: Selective test execution", () => {
    it("GIVEN staged files outside the fixture-exclusion drift check WHEN committing THEN no test runner output appears", async () => {
      await expect(assertPrecommitSkipsTestsForNonFixtureFiles()).resolves.toBeUndefined();
    });

    it("GIVEN staged fixture-exclusion inputs WHEN committing THEN the drift check runs", async () => {
      await expect(assertPrecommitRunsFixtureExclusionCheckForMatchingFiles()).resolves.toBeUndefined();
    });
  });
});
