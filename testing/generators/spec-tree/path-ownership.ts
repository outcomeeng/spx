import { KIND_REGISTRY, SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND, type SpecTreeSourceEntry } from "@/lib/spec-tree";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { type RepresentativeSpecTreeFixture, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import * as fc from "fast-check";

export interface SpecTreePathOwnershipScenario {
  readonly entries: readonly SpecTreeSourceEntry[];
  readonly path: string;
  readonly claimedNodeIds: readonly string[];
  readonly expectedKind:
    | typeof SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED
    | typeof SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.UNRESOLVED;
  readonly expectedCandidateIds: readonly string[];
  readonly expectedGoverningOwnerId: string | null;
}

export function arbitrarySpecTreePathOwnershipScenario(): fc.Arbitrary<SpecTreePathOwnershipScenario> {
  return SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY).chain((fixture) =>
    fc.tuple(
      arbitrarySourceFilePath(),
      fc.shuffledSubarray([fixture.root.id, fixture.child.id, fixture.peer.id]),
      fc.array(fc.constantFrom(fixture.root.id, fixture.child.id, fixture.peer.id), { maxLength: 4 }),
    ).map(([path, selected, duplicates]) => {
      const claimedNodeIds = [...selected, ...duplicates.filter((id) => selected.includes(id))];
      const expectedCandidateIds = [fixture.root.id, fixture.child.id, fixture.peer.id]
        .filter((id) => selected.includes(id));
      return {
        entries: fixture.entries,
        path,
        claimedNodeIds,
        expectedKind: expectedCandidateIds.length === 0
          ? SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.UNRESOLVED
          : SPEC_TREE_PATH_OWNERSHIP_RESULT_KIND.RESOLVED,
        expectedCandidateIds,
        expectedGoverningOwnerId: governingOwnerId(fixture, expectedCandidateIds),
      };
    })
  );
}

function governingOwnerId(
  fixture: RepresentativeSpecTreeFixture,
  candidateIds: readonly string[],
): string | null {
  if (candidateIds.length === 0) return null;
  if (candidateIds.length === 1) return candidateIds[0] ?? null;
  if (candidateIds.includes(fixture.peer.id)) return fixture.product.id;
  return fixture.root.id;
}
