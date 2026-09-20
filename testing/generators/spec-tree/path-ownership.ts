import { KIND_REGISTRY, type SpecTreeSourceEntry } from "@/lib/spec-tree";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import * as fc from "fast-check";

export interface SpecTreePathOwnershipScenario {
  readonly entries: readonly SpecTreeSourceEntry[];
  readonly path: string;
  readonly claimedNodeIds: readonly string[];
  /** The distinct claimed nodes in tree order — root, its child, then the peer branch. */
  readonly expectedCandidateIds: readonly string[];
  /** The lowest common ancestor of the candidates: the product when they span both branches, null when none is claimed. */
  readonly expectedGoverningOwnerId: string | null;
}

export function arbitrarySpecTreePathOwnershipScenario(): fc.Arbitrary<SpecTreePathOwnershipScenario> {
  return SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY).chain((fixture) =>
    fc.tuple(
      arbitrarySourceFilePath(),
      fc.shuffledSubarray([fixture.root.id, fixture.child.id, fixture.peer.id]),
      fc.array(fc.constantFrom(fixture.root.id, fixture.child.id, fixture.peer.id), { maxLength: 4 }),
    ).map(([path, selected, duplicates]) => {
      const expectedCandidateIds = [fixture.root.id, fixture.child.id, fixture.peer.id]
        .filter((id) => selected.includes(id));
      return {
        entries: fixture.entries,
        path,
        claimedNodeIds: [...selected, ...duplicates.filter((id) => selected.includes(id))],
        expectedCandidateIds,
        expectedGoverningOwnerId: governingOwner(fixture, expectedCandidateIds),
      };
    })
  );
}

function governingOwner(
  fixture: {
    readonly product: { readonly id: string };
    readonly root: { readonly id: string };
    readonly peer: { readonly id: string };
  },
  candidateIds: readonly string[],
): string | null {
  if (candidateIds.length === 0) return null;
  if (candidateIds.length === 1) return candidateIds[0] ?? null;
  return candidateIds.includes(fixture.peer.id) ? fixture.product.id : fixture.root.id;
}
