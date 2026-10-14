/**
 * Cases for node state derivation: the evidence a node carries, and the state each combination
 * maps to.
 *
 * The domain is every ordered sequence of up to two evidence entries over the evidence statuses
 * the library surface exposes. The expected state follows the spec's mapping and its precedence:
 * a node with no evidence is declared; failing evidence anywhere makes it failing; evidence that
 * is all passing makes it passing; any other combination, linked evidence beside the rest, makes it
 * specified. The expectation reads no field of the derivation under test.
 *
 * @module generators/spec-tree/node-state-derivation
 */

import {
  KIND_REGISTRY,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_NODE_STATE,
  type SpecTreeEvidenceStatus,
  type SpecTreeNodeState,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import {
  buildEvidenceEntry,
  buildNodeEntry,
  buildRepresentativeFixture,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

const EVIDENCE_LABEL_JOINER = " beside ";
const NO_EVIDENCE_LABEL = "no evidence";
const PROVIDER_LABEL_JOINER = " with provider ";

export type NodeStateCase = {
  readonly label: string;
  readonly entries: readonly SpecTreeSourceEntry[];
  readonly expected: SpecTreeNodeState;
};

export type ProviderOverrideCase = {
  readonly label: string;
  readonly entries: readonly SpecTreeSourceEntry[];
  readonly providerState: SpecTreeNodeState;
};

function evidenceStatuses(): readonly SpecTreeEvidenceStatus[] {
  return Object.values(SPEC_TREE_EVIDENCE_STATUS);
}

/** Every ordered sequence of up to two statuses, the empty sequence included. */
function evidenceSequences(): readonly (readonly SpecTreeEvidenceStatus[])[] {
  const singles = evidenceStatuses().map((status) => [status]);
  const pairs = singles.flatMap((first) => singles.map((second) => [...first, ...second]));
  return [[], ...singles, ...pairs];
}

function expectedStateOf(statuses: readonly SpecTreeEvidenceStatus[]): SpecTreeNodeState {
  if (statuses.length === 0) return SPEC_TREE_NODE_STATE.DECLARED;
  if (statuses.includes(SPEC_TREE_EVIDENCE_STATUS.FAILING)) return SPEC_TREE_NODE_STATE.FAILING;
  if (statuses.every((status) => status === SPEC_TREE_EVIDENCE_STATUS.PASSING)) return SPEC_TREE_NODE_STATE.PASSING;
  return SPEC_TREE_NODE_STATE.SPECIFIED;
}

function labelOf(statuses: readonly SpecTreeEvidenceStatus[]): string {
  return statuses.length === 0 ? NO_EVIDENCE_LABEL : statuses.join(EVIDENCE_LABEL_JOINER);
}

function entriesFor(statuses: readonly SpecTreeEvidenceStatus[]): readonly SpecTreeSourceEntry[] {
  const fixture = buildRepresentativeFixture(KIND_REGISTRY);
  return [
    buildNodeEntry(KIND_REGISTRY, {
      id: fixture.root.id,
      orderSegments: fixture.root.orderSegments,
      slug: fixture.root.slug,
    }),
    ...statuses.map((status, position) =>
      buildEvidenceEntry({
        id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId(), position),
        parentId: fixture.root.id,
        status,
      })
    ),
  ];
}

/** One case per ordered evidence sequence of up to two entries, with the state its precedence maps to. */
export function nodeStateCases(): readonly NodeStateCase[] {
  return evidenceSequences().map((statuses) => ({
    label: labelOf(statuses),
    entries: entriesFor(statuses),
    expected: expectedStateOf(statuses),
  }));
}

/** One case per provider outcome and per single evidence entry or none, a node with and without evidence. */
export function providerOverrideCases(): readonly ProviderOverrideCase[] {
  const nodeEvidence = evidenceSequences().filter((statuses) => statuses.length <= 1);
  return Object.values(SPEC_TREE_NODE_STATE).flatMap((providerState) =>
    nodeEvidence.map((statuses) => ({
      label: [labelOf(statuses), providerState].join(PROVIDER_LABEL_JOINER),
      entries: entriesFor(statuses),
      providerState,
    }))
  );
}
