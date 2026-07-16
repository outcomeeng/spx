import { describe, expect, it } from "vitest";

import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import { arbitraryFileScopeIdentityScenario, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  createVerifyRunContextScenario,
  startChangesetScopeRun,
  startFileScopeRun,
  withChangedPaths,
  withScope,
} from "@testing/harnesses/verify/harness";

describe("verify scope mapping", () => {
  it("maps changeset selectors to changed product paths", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.changesetScopeScenario(),
      async (scope) => {
        const scenario = withChangedPaths(
          withScope(createVerifyRunContextScenario(), scope.range.base, scope.range.head),
          scope.changedPaths,
        );
        const started = await startChangesetScopeRun(scenario);
        expect(started.report.resolvedScope).toStrictEqual(
          [...scope.changedPaths].sort((left, right) => left.localeCompare(right)),
        );
        expect(started.context.context.subject).toStrictEqual({
          kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
          base: scope.range.base,
          head: scope.range.head,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps file selectors to one normalized product-relative path", async () => {
    await assertProperty(
      arbitraryFileScopeIdentityScenario(),
      async (scope) => {
        const started = await startFileScopeRun(scope.input);
        expect(started.report.resolvedScope).toStrictEqual([scope.normalized]);
        expect(started.context.context.subject).toStrictEqual({
          kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
          path: scope.normalized,
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
