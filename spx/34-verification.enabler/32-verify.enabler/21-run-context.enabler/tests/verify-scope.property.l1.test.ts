import { describe, expect, it } from "vitest";

import { arbitraryFileScopeIdentityScenario, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

import {
  assertChangedPathsStayOutsideContextDigest,
  assertChangesetReconstructionChangesContextDigest,
  assertChangesetScopeDerivesChangedFiles,
  createVerifyRunContextScenario,
  startChangesetScopeRun,
  startFileScopeRun,
  withScope,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify changeset scope properties", () => {
  it("resolves any changeset into the derived changed-file scope", async () => {
    await assertChangesetScopeDerivesChangedFiles();
  });

  it("maps base and head into distinct context digests", async () => {
    await assertChangesetReconstructionChangesContextDigest();
  });

  it("keeps derived changed paths outside the canonical context", async () => {
    await assertChangedPathsStayOutsideContextDigest();
  });

  it("maps resolved selectors and run target to the reported run token", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.runLocatorScenario(),
      async (scope) => {
        const started = await startChangesetScopeRun(
          withVerificationType(
            withScope(createVerifyRunContextScenario(), scope.range.base, scope.range.head),
            scope.verificationType,
          ),
        );
        expect(started.report.locator).toStrictEqual(started.expectedLocator);
        expect(started.runTargetExists).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("preserves every file selector in its run locator", async () => {
    await assertProperty(
      arbitraryFileScopeIdentityScenario(),
      async (scope) => {
        const started = await startFileScopeRun(scope.input);
        expect(started.report.locator).toStrictEqual(started.expectedLocator);
        expect(started.runTargetExists).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
