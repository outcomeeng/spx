import { KIND_REGISTRY, type SpecTreeSourceEntry } from "@/lib/spec-tree";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import * as fc from "fast-check";

export interface SpecTreePathOwnershipScenario {
  readonly entries: readonly SpecTreeSourceEntry[];
  readonly path: string;
  readonly claimedNodeIds: readonly string[];
  readonly productId: string;
  readonly rootNodeId: string;
  readonly childNodeId: string;
  readonly peerNodeId: string;
}

export function arbitrarySpecTreePathOwnershipScenario(): fc.Arbitrary<SpecTreePathOwnershipScenario> {
  return SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY).chain((fixture) =>
    fc.tuple(
      arbitrarySourceFilePath(),
      fc.shuffledSubarray([fixture.root.id, fixture.child.id, fixture.peer.id]),
      fc.array(fc.constantFrom(fixture.root.id, fixture.child.id, fixture.peer.id), { maxLength: 4 }),
    ).map(([path, selected, duplicates]) => ({
      entries: fixture.entries,
      path,
      claimedNodeIds: [...selected, ...duplicates.filter((id) => selected.includes(id))],
      productId: fixture.product.id,
      rootNodeId: fixture.root.id,
      childNodeId: fixture.child.id,
      peerNodeId: fixture.peer.id,
    }))
  );
}
