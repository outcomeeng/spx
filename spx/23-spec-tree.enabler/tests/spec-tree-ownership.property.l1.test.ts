import { readSpecTree, resolveSpecTreePathOwnership, SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND } from "@/lib/spec-tree";
import { arbitrarySpecTreePathOwnershipScenario } from "@testing/generators/spec-tree/path-ownership";
import { createSource } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { describe, expect, it } from "vitest";

describe("resolveSpecTreePathOwnership", () => {
  it("resolves every generated claim set independently of duplicates and claim order", async () => {
    await assertProperty(
      arbitrarySpecTreePathOwnershipScenario(),
      async (scenario) => {
        const snapshot = await readSpecTree({ source: createSource(scenario.entries) });
        const result = resolveSpecTreePathOwnership(snapshot, scenario.path, scenario.claimedNodeIds);

        expect(result.kind).toBe(scenario.expectedKind);
        expect(result.path).toBe(scenario.path);
        expect(result.candidates.map((candidate) => candidate.id)).toEqual(scenario.expectedCandidateIds);
        if (result.kind === SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED) {
          expect(result.governingOwner.id).toBe(scenario.expectedGoverningOwnerId);
        } else {
          expect(scenario.expectedGoverningOwnerId).toBeNull();
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
