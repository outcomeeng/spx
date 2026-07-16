import { describe, expect, it } from "vitest";

import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import {
  arbitraryFileScopeIdentityScenario,
  sampleVerifyTestValue,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import {
  createVerifyRunContextScenario,
  startChangesetScopeRun,
  startFileScopeRun,
  withChangedPaths,
  withScope,
} from "@testing/harnesses/verify/harness";

describe("verify scope mapping", () => {
  it("maps changeset selectors to changed product paths", async () => {
    await expect(
      startChangesetScopeRun(
        withChangedPaths(
          withScope(
            createVerifyRunContextScenario(),
            sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetScopeScenario()).range.base,
            sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetScopeScenario()).range.head,
          ),
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetScopeScenario()).changedPaths,
        ),
      ),
    ).resolves.toMatchObject({
      report: {
        resolvedScope: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetScopeScenario()).resolvedPaths,
      },
      context: {
        context: {
          subject: {
            kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
            base: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetScopeScenario()).range.base,
            head: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetScopeScenario()).range.head,
          },
        },
      },
    });
  });

  it("maps file selectors to one normalized product-relative path", async () => {
    await expect(
      startFileScopeRun(sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).input),
    ).resolves.toMatchObject({
      report: {
        resolvedScope: [sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).normalized],
      },
      context: {
        context: {
          subject: {
            kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
            path: sampleVerifyTestValue(arbitraryFileScopeIdentityScenario()).normalized,
          },
        },
      },
    });
  });
});
