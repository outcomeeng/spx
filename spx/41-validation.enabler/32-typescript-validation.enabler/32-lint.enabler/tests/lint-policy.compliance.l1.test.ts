import { describe, expect, it } from "vitest";

import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { lintPolicyDebtCases, VALIDATION_LINT_POLICY_DATA } from "@testing/generators/validation/lint-policy";
import {
  observeBranchAddition,
  observeEslintConfigLoad,
  observePolicyUnderHookGitVariables,
  observePolicyWithCorruptBaseline,
  observePolicyWithExistingDebt,
  observePolicyWithoutBaseline,
  observePolicyWithoutManifests,
  observeTestOwnedConstantDebtAddition,
} from "@testing/harnesses/validation/lint-policy";

describe("repository lint-debt manifest policy", () => {
  it.each(lintPolicyDebtCases())(`skips a product without the manifests, ${SPEC_TREE_CASE_TITLE}`, async (debtCase) => {
    const result = await observePolicyWithoutManifests(debtCase);

    expect(result.ok).toBe(true);
  });

  it.each(lintPolicyDebtCases())(
    `accepts existing debt without Git metadata, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const result = await observePolicyWithExistingDebt(debtCase);

      expect(result.ok).toBe(true);
    },
  );

  it.each(lintPolicyDebtCases())(
    `rejects a branch addition to the lint-debt manifest and fails the lint command, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const observation = await observeBranchAddition(debtCase);

      expect(observation.policy.ok).toBe(false);
      if (!observation.policy.ok) {
        expect(observation.policy.error).toContain(VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES.file);
        expect(observation.policy.error).toContain(debtCase.addedDebtPath);
      }
      expect(observation.command.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
      expect(observation.command.output).toContain(debtCase.addedDebtPath);
    },
  );

  it.each(lintPolicyDebtCases())(
    `rejects a branch addition to the test-owned-constant manifest, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const result = await observeTestOwnedConstantDebtAddition(debtCase);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(
          VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES.file,
        );
        expect(result.error).toContain(debtCase.addedDebtPath);
      }
    },
  );

  it.each(lintPolicyDebtCases())(
    `skips the comparison when no baseline exists, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const result = await observePolicyWithoutBaseline(debtCase);

      expect(result.ok).toBe(true);
    },
  );

  it.each(lintPolicyDebtCases())(
    `keeps nested Git commands inside the fixture under hook Git variables, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const observation = await observePolicyUnderHookGitVariables(debtCase);

      expect(observation.policy.ok).toBe(true);
      expect(observation.outerBranch).toBe(VALIDATION_LINT_POLICY_DATA.outerRepoBranch);
      expect(observation.outerUserEmail).toBe(VALIDATION_LINT_POLICY_DATA.outerRepoUserEmail);
      expect(observation.outerUserName).toBe(VALIDATION_LINT_POLICY_DATA.outerRepoUserName);
    },
  );

  it.each(lintPolicyDebtCases())(
    `rejects a corrupt baseline manifest, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const result = await observePolicyWithCorruptBaseline(debtCase);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES.file);
        expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.jsonObjectErrorFragment);
      }
    },
  );

  it.each(lintPolicyDebtCases())(
    `never runs the policy while loading eslint.config.ts, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const stdout = await observeEslintConfigLoad(debtCase);

      expect(stdout).toContain(VALIDATION_LINT_POLICY_DATA.configLoadSuccessMarker);
    },
  );
});
