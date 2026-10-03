import * as fc from "fast-check";

import {
  KIND_REGISTRY,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeDecisionSourceEntry,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { type RepresentativeSpecTreeFixture, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

/**
 * A source whose decision entries exercise the shapes a parent-attachment rule can break on:
 * at least one decision names the nested child node as its parent, every added decision is
 * yielded before the node entries it names, several decisions may share one parent, and at
 * least one product-level decision carries no parent id.
 */
export interface DecisionAttachmentScenario {
  readonly entries: readonly SpecTreeSourceEntry[];
  /** Every decision entry the source yields, parented or product-level. */
  readonly decisions: readonly SpecTreeDecisionSourceEntry[];
}

const DECISION_ATTACHMENT_LIMITS = {
  /** The first added decision is parented to the nested child; the second is product-level. */
  MIN_ADDED_DECISIONS: 2,
  MAX_ADDED_DECISIONS: 10,
} as const;

export function arbitraryDecisionAttachmentScenario(): fc.Arbitrary<DecisionAttachmentScenario> {
  return SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY).chain((fixture) =>
    fc
      .uniqueArray(
        SPEC_TREE_TEST_GENERATOR.sourceId().filter((id) => !fixture.entries.some((entry) => entry.id === id)),
        {
          minLength: DECISION_ATTACHMENT_LIMITS.MIN_ADDED_DECISIONS,
          maxLength: DECISION_ATTACHMENT_LIMITS.MAX_ADDED_DECISIONS,
        },
      )
      .chain((ids) => fc.tuple(...ids.map((id, index) => arbitraryAddedDecision(fixture, id, index))))
      .chain((added) =>
        fc
          .shuffledSubarray(added, { minLength: added.length, maxLength: added.length })
          .map((shuffled) => ({
            entries: [...shuffled, ...fixture.entries],
            decisions: [...shuffled, fixture.decision],
          }))
      )
  );
}

function arbitraryAddedDecision(
  fixture: RepresentativeSpecTreeFixture,
  id: string,
  index: number,
): fc.Arbitrary<SpecTreeDecisionSourceEntry> {
  return fc
    .record({
      parentId: arbitraryAddedDecisionParent(fixture, index),
      kind: SPEC_TREE_TEST_GENERATOR.decisionKind(KIND_REGISTRY),
      order: SPEC_TREE_TEST_GENERATOR.sourceOrder(),
      slug: SPEC_TREE_TEST_GENERATOR.sourceSlug(),
      title: SPEC_TREE_TEST_GENERATOR.sourceTitle(),
    })
    .map(({ parentId, kind, order, slug, title }) => ({
      type: SPEC_TREE_ENTRY_TYPE.DECISION,
      id,
      kind,
      order,
      slug,
      title,
      ...(parentId === undefined ? {} : { parentId }),
    }));
}

function arbitraryAddedDecisionParent(
  fixture: RepresentativeSpecTreeFixture,
  index: number,
): fc.Arbitrary<string | undefined> {
  if (index === 0) return fc.constant(fixture.child.id);
  if (index === 1) return fc.constant(undefined);
  return fc.option(fc.constantFrom(fixture.root.id, fixture.child.id, fixture.peer.id), { nil: undefined });
}
