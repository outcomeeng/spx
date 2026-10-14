/**
 * Cases for node state derivation: the evidence a node carries, and the state the spec maps it to.
 *
 * The spec states four single-status rows: missing evidence maps to declared, linked evidence maps
 * to specified, failing evidence maps to failing, and passing evidence maps to passing. Each
 * expectation is that sentence, read from the spec and no field of the derivation under test. The
 * spec states no rule for several evidence entries, so no case carries more than one.
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

/** The empty sequence and every single-status sequence. */
function evidenceSequences(): readonly (readonly SpecTreeEvidenceStatus[])[] {
  return [[], ...evidenceStatuses().map((status) => [status])];
}

function labelOf(statuses: readonly SpecTreeEvidenceStatus[]): string {
  return statuses[0] ?? NO_EVIDENCE_LABEL;
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

/** The four rows the spec states: no evidence, then linked, failing, and passing evidence. */
export function nodeStateCases(): readonly NodeStateCase[] {
  return [
    { statuses: [], expected: SPEC_TREE_NODE_STATE.DECLARED },
    { statuses: [SPEC_TREE_EVIDENCE_STATUS.LINKED], expected: SPEC_TREE_NODE_STATE.SPECIFIED },
    { statuses: [SPEC_TREE_EVIDENCE_STATUS.FAILING], expected: SPEC_TREE_NODE_STATE.FAILING },
    { statuses: [SPEC_TREE_EVIDENCE_STATUS.PASSING], expected: SPEC_TREE_NODE_STATE.PASSING },
  ].map(({ statuses, expected }) => ({
    label: labelOf(statuses),
    entries: entriesFor(statuses),
    expected,
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
