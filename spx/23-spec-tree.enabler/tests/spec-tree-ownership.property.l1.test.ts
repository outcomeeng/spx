import { readSpecTree, resolveSpecTreePathOwnership, SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND } from "@/lib/spec-tree";
import { arbitrarySpecTreePathOwnershipScenario } from "@testing/generators/spec-tree/path-ownership";
import { createSerializedSource, createSource } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { describe, expect, it } from "vitest";

describe("resolveSpecTreePathOwnership", () => {
  it("resolves every generated claim set independently of duplicates and claim order", async () => {
    await assertProperty(
      arbitrarySpecTreePathOwnershipScenario(),
      async (scenario) => {
        const expectedCandidateIds = [scenario.rootNodeId, scenario.childNodeId, scenario.peerNodeId]
          .filter((id) => scenario.claimedNodeIds.includes(id));
        const expectedGoverningOwnerId = (() => {
          if (expectedCandidateIds.length === 0) return null;
          if (expectedCandidateIds.length === 1) return expectedCandidateIds[0];
          if (expectedCandidateIds.includes(scenario.peerNodeId)) return scenario.productId;
          return scenario.rootNodeId;
        })();
        const snapshots = await Promise.all([
          readSpecTree({ source: createSource(scenario.entries) }),
          readSpecTree({ source: createSerializedSource(scenario.entries) }),
        ]);
        for (const snapshot of snapshots) {
          const result = resolveSpecTreePathOwnership(snapshot, scenario.path, scenario.claimedNodeIds);

          expect(result.kind).toBe(
            expectedCandidateIds.length === 0
              ? SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.UNRESOLVED
              : SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED,
          );
          expect(result.path).toBe(scenario.path);
          expect(result.candidates.map((candidate) => candidate.id)).toEqual(expectedCandidateIds);
          if (result.kind === SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED) {
            expect(result.governingOwner.id).toBe(expectedGoverningOwnerId);
          } else {
            expect(expectedGoverningOwnerId).toBeNull();
          }
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
