import { describe, expect, it } from "vitest";

import { VERIFY_START_REPORT_FIELD } from "@/commands/verify/cli";
import { VERIFY_SCOPE_SEPARATOR, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitrarySafeFileScopeIdentity, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  createVerifyRunContextScenario,
  recordVerifyStartOptions,
  startChangesetScopeRun,
  startFileScopeRun,
  withChangedPaths,
  withScope,
} from "@testing/harnesses/verify/harness";

describe("record-run scope option mapping", () => {
  it("passes file selectors through the caller-driven command path", async () => {
    await assertProperty(
      arbitrarySafeFileScopeIdentity(),
      async (path) => {
        expect(await recordVerifyStartOptions(VERIFY_SCOPE_TYPE.FILE, path)).toMatchObject([{
          scopeType: VERIFY_SCOPE_TYPE.FILE,
          scope: path,
        }]);
        const started = await startFileScopeRun(path);
        expect(started.report.resolvedScope).toStrictEqual([path]);
        expect(Object.keys(started.report)).toStrictEqual(Object.values(VERIFY_START_REPORT_FIELD));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("passes changeset selectors through the same scope options", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.changesetScopeScenario(),
      async (scope) => {
        expect(
          await recordVerifyStartOptions(
            VERIFY_SCOPE_TYPE.CHANGESET,
            `${scope.range.base}${VERIFY_SCOPE_SEPARATOR}${scope.range.head}`,
          ),
        ).toMatchObject([{
          scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
          scope: `${scope.range.base}${VERIFY_SCOPE_SEPARATOR}${scope.range.head}`,
        }]);
        const started = await startChangesetScopeRun(withChangedPaths(
          withScope(createVerifyRunContextScenario(), scope.range.base, scope.range.head),
          scope.changedPaths,
        ));
        expect(started.report.resolvedScope).toStrictEqual(
          [...scope.changedPaths].sort((left, right) => left.localeCompare(right)),
        );
        expect(Object.keys(started.report)).toStrictEqual(Object.values(VERIFY_START_REPORT_FIELD));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
