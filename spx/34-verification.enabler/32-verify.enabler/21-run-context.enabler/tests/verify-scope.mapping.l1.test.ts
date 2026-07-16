import { describe, expect, it } from "vitest";

import { pathsFromNameStatus } from "@/lib/git/name-status";
import {
  arbitrarySafeFileScopeIdentity,
  formatNameStatusZ,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  createVerifyRunContextScenario,
  startFileScopeRun,
  startReportFor,
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
        expect((await startReportFor(scenario)).resolvedScope).toStrictEqual(
          pathsFromNameStatus(formatNameStatusZ(scope.changedPaths)),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps file selectors to one normalized product-relative path", async () => {
    await assertProperty(
      arbitrarySafeFileScopeIdentity(),
      async (path) => {
        expect((await startFileScopeRun(path)).report.resolvedScope).toStrictEqual([path]);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
