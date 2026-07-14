import assert from "node:assert/strict";

import type { ConsolidationResult, Permissions } from "@/domains/claude/settings/types";
import {
  arbitraryPermissionConflictScenario,
  arbitraryPermissionMergePermutationScenario,
  arbitraryPermissionMergeScenario,
  arbitraryPermissionUnionScenario,
  sampleScenario,
} from "@testing/generators/claude/permissions/scenarios";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

export type MergePermissions = (
  global: Permissions,
  local: Permissions[],
) => { merged: Permissions; result: ConsolidationResult };

export function assertMergeIsDeterministic(
  mergePermissions: MergePermissions,
): void {
  assertProperty(
    arbitraryPermissionMergeScenario(),
    (scenario) => {
      assert.deepEqual(
        mergePermissions(structuredClone(scenario.global), structuredClone(scenario.local)),
        mergePermissions(structuredClone(scenario.global), structuredClone(scenario.local)),
      );
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertMergeIsCommutative(
  mergePermissions: MergePermissions,
): void {
  assertProperty(
    arbitraryPermissionMergePermutationScenario(),
    (scenario) => {
      assert.deepEqual(
        mergePermissions(structuredClone(scenario.global), structuredClone(scenario.local)),
        mergePermissions(
          structuredClone(scenario.global),
          structuredClone(scenario.permutedLocal),
        ),
      );
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertMergeIsExactUnionWithoutConflicts(
  mergePermissions: MergePermissions,
): void {
  const scenario = sampleScenario(arbitraryPermissionUnionScenario());
  const output = mergePermissions(
    structuredClone(scenario.global),
    structuredClone(scenario.local),
  );

  assert.deepEqual(output.merged, scenario.expectedMerged);
}

export function assertDenyTakesPrecedence(
  mergePermissions: MergePermissions,
): void {
  const scenario = sampleScenario(arbitraryPermissionConflictScenario());
  const output = mergePermissions(
    structuredClone(scenario.global),
    structuredClone(scenario.local),
  );

  assert.ok(!(output.merged.allow ?? []).includes(scenario.permission));
  assert.ok((output.merged.deny ?? []).includes(scenario.permission));
  assert.equal(output.result.conflictsResolved, 1);
}
