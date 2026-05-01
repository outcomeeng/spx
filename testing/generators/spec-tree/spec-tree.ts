import * as fc from "fast-check";

import {
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_EVIDENCE_STATUS,
  SPEC_TREE_SOURCE_ENTRY_KEYS,
  type SpecTreeDecisionSourceEntry,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNodeSourceEntry,
  type SpecTreeRegistry,
  type SpecTreeSource,
  type SpecTreeSourceEntry,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import {
  type DecisionKind,
  type NodeKind,
  SPEC_TREE_KIND_CATEGORY,
  type SpecTreeKindCategory,
} from "@/lib/spec-tree/config";

type SpecTreeEntryDiscriminatorKey =
  | typeof SPEC_TREE_SOURCE_ENTRY_KEYS.TYPE
  | typeof SPEC_TREE_SOURCE_ENTRY_KEYS.KIND;

type SpecTreeEntryTypeKey = typeof SPEC_TREE_SOURCE_ENTRY_KEYS.TYPE;

type RepresentativeEntries = {
  readonly product: Extract<SpecTreeSourceEntry, { readonly type: typeof SPEC_TREE_ENTRY_TYPE.PRODUCT }>;
  readonly root: SpecTreeNodeSourceEntry;
  readonly child: SpecTreeNodeSourceEntry;
  readonly peer: SpecTreeNodeSourceEntry;
  readonly decision: SpecTreeDecisionSourceEntry;
  readonly childEvidence: SpecTreeEvidenceSourceEntry;
  readonly peerEvidence: SpecTreeEvidenceSourceEntry;
  readonly entries: readonly SpecTreeSourceEntry[];
};

const SPEC_TREE_TEST_GENERATOR_OPTIONS = {
  REPRESENTATIVE_ID_COUNT: 7,
  REPRESENTATIVE_SLUG_COUNT: 4,
  REPRESENTATIVE_TITLE_COUNT: 5,
  REPRESENTATIVE_ORDER_COUNT: 4,
} as const;

export const SPEC_TREE_TEST_GENERATOR = {
  sourceId: arbitrarySourceId,
  sourceSlug: arbitrarySourceSlug,
  sourceTitle: arbitrarySourceTitle,
  sourceOrder: arbitrarySourceOrder,
  sourceRef: arbitrarySourceRef,
  representativeFixture: arbitraryRepresentativeFixture,
} as const;

export function sampleSpecTreeTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Spec-tree test generator returned no sample");
  }
  return value;
}

export function createSource(entries: readonly SpecTreeSourceEntry[]): SpecTreeSource {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

export function buildRepresentativeFixture(registry: SpecTreeRegistry): RepresentativeEntries {
  return sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.representativeFixture(registry));
}

export function buildRepresentativeEntries(registry: SpecTreeRegistry): readonly SpecTreeSourceEntry[] {
  return buildRepresentativeFixture(registry).entries;
}

export function sampleNodeKind(registry: SpecTreeRegistry): NodeKind {
  return sampleSpecTreeTestValue(arbitraryNodeKind(registry));
}

export function sampleDecisionKind(registry: SpecTreeRegistry): DecisionKind {
  return sampleSpecTreeTestValue(arbitraryDecisionKind(registry));
}

export function withGeneratedSourceRef(entry: SpecTreeSourceEntry): SpecTreeSourceEntry {
  return {
    ...entry,
    ref: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceRef()),
  };
}

export function buildNodeEntry(
  registry: SpecTreeRegistry,
  entry: Omit<SpecTreeNodeSourceEntry, SpecTreeEntryDiscriminatorKey>,
): SpecTreeNodeSourceEntry {
  return {
    type: SPEC_TREE_ENTRY_TYPE.NODE,
    kind: sampleSpecTreeTestValue(arbitraryNodeKind(registry)),
    ...entry,
  };
}

export function buildDecisionEntry(
  registry: SpecTreeRegistry,
  entry: Omit<SpecTreeDecisionSourceEntry, SpecTreeEntryDiscriminatorKey>,
): SpecTreeDecisionSourceEntry {
  return {
    type: SPEC_TREE_ENTRY_TYPE.DECISION,
    kind: sampleSpecTreeTestValue(arbitraryDecisionKind(registry)),
    ...entry,
  };
}

export function buildEvidenceEntry(
  entry: Omit<SpecTreeEvidenceSourceEntry, SpecTreeEntryTypeKey>,
): SpecTreeEvidenceSourceEntry {
  return {
    type: SPEC_TREE_ENTRY_TYPE.EVIDENCE,
    ...entry,
  };
}

function arbitraryRepresentativeFixture(registry: SpecTreeRegistry): fc.Arbitrary<RepresentativeEntries> {
  return fc
    .record({
      ids: fc.uniqueArray(arbitrarySourceId(), {
        minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ID_COUNT,
        maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ID_COUNT,
      }),
      slugs: fc.uniqueArray(arbitrarySourceSlug(), {
        minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_SLUG_COUNT,
        maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_SLUG_COUNT,
      }),
      titles: fc.uniqueArray(arbitrarySourceTitle(), {
        minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_TITLE_COUNT,
        maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_TITLE_COUNT,
      }),
      orders: fc.uniqueArray(arbitrarySourceOrder(), {
        minLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_COUNT,
        maxLength: SPEC_TREE_TEST_GENERATOR_OPTIONS.REPRESENTATIVE_ORDER_COUNT,
      }),
      productRef: arbitrarySourceRef(),
      rootRef: arbitrarySourceRef(),
    })
    .map(({ ids, slugs, titles, orders, productRef, rootRef }) => {
      const sortedOrders = [...orders].sort((left, right) => left - right);
      const [productId, rootId, childId, peerId, decisionId, childEvidenceId, peerEvidenceId] = ids;
      const [rootSlug, childSlug, peerSlug, decisionSlug] = slugs;
      const [productTitle, rootTitle, childTitle, peerTitle, decisionTitle] = titles;
      const [decisionOrder, rootOrder, childOrder, peerOrder] = sortedOrders;

      if (
        productId === undefined
        || rootId === undefined
        || childId === undefined
        || peerId === undefined
        || decisionId === undefined
        || childEvidenceId === undefined
        || peerEvidenceId === undefined
        || rootSlug === undefined
        || childSlug === undefined
        || peerSlug === undefined
        || decisionSlug === undefined
        || productTitle === undefined
        || rootTitle === undefined
        || childTitle === undefined
        || peerTitle === undefined
        || decisionTitle === undefined
        || decisionOrder === undefined
        || rootOrder === undefined
        || childOrder === undefined
        || peerOrder === undefined
      ) {
        throw new Error("Representative spec-tree generator returned an incomplete fixture");
      }

      const product = {
        type: SPEC_TREE_ENTRY_TYPE.PRODUCT,
        id: productId,
        title: productTitle,
        ref: productRef,
      };
      const root = buildNodeEntry(registry, {
        id: rootId,
        order: rootOrder,
        slug: rootSlug,
        title: rootTitle,
        ref: rootRef,
      });
      const child = buildNodeEntry(registry, {
        id: childId,
        order: childOrder,
        slug: childSlug,
        parentId: rootId,
        title: childTitle,
      });
      const peer = buildNodeEntry(registry, {
        id: peerId,
        order: peerOrder,
        slug: peerSlug,
        title: peerTitle,
      });
      const decision = buildDecisionEntry(registry, {
        id: decisionId,
        order: decisionOrder,
        slug: decisionSlug,
        parentId: rootId,
        title: decisionTitle,
      });
      const childEvidence = buildEvidenceEntry({
        id: childEvidenceId,
        parentId: childId,
        status: SPEC_TREE_EVIDENCE_STATUS.PASSING,
      });
      const peerEvidence = buildEvidenceEntry({
        id: peerEvidenceId,
        parentId: peerId,
        status: SPEC_TREE_EVIDENCE_STATUS.FAILING,
      });

      return {
        product,
        root,
        child,
        peer,
        decision,
        childEvidence,
        peerEvidence,
        entries: [product, root, child, peer, decision, childEvidence, peerEvidence],
      };
    });
}

function arbitrarySourceId(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitrarySourceSlug(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitrarySourceTitle(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitrarySourceOrder(): fc.Arbitrary<number> {
  return fc.integer();
}

function arbitrarySourceRef(): fc.Arbitrary<SpecTreeSourceRef> {
  return arbitrarySourceId().map((id) => ({
    id,
    path: id,
  }));
}

function arbitraryNodeKind(registry: SpecTreeRegistry): fc.Arbitrary<NodeKind> {
  return fc.constantFrom(
    ...readKinds<NodeKind>(registry, SPEC_TREE_KIND_CATEGORY.NODE, "node kind"),
  );
}

function arbitraryDecisionKind(registry: SpecTreeRegistry): fc.Arbitrary<DecisionKind> {
  return fc.constantFrom(
    ...readKinds<DecisionKind>(registry, SPEC_TREE_KIND_CATEGORY.DECISION, "decision kind"),
  );
}

function readKinds<K extends NodeKind | DecisionKind>(
  registry: SpecTreeRegistry,
  category: SpecTreeKindCategory,
  description: string,
): [K, ...K[]] {
  const kinds = Object.entries(registry)
    .filter(([, definition]) => definition.category === category)
    .map(([kind]) => kind as K);
  return requireNonEmpty(kinds, description);
}

function requireNonEmpty<T>(values: readonly T[], description: string): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) {
    throw new Error(`Spec-tree registry has no ${description}`);
  }
  return [first, ...rest];
}
