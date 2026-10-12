/**
 * Cases and construction-derived expectations for the kind grammar: the opening keyword each
 * node kind resolves and the child kinds each node kind admits.
 *
 * The domain of every case is the registered node and output kinds, taken from the library
 * surface. Every expected value comes from the filename-grammar spec's statements and from no
 * field of the kind registry: the opening keyword of each self-described kind, the children each
 * 3.x kind admits, a foundation order over the output kinds that fixes their admitted children,
 * and a variant that takes its parent's place.
 *
 * @module generators/spec-tree/kind-grammar
 */

import {
  NODE_KINDS,
  OUTPUT_KINDS,
  SPEC_TREE_CONFIG,
  type SpecTreeChildKind,
  type SpecTreeContainerKind,
  type SpecTreeNodeKind,
} from "@/lib/spec-tree";

const VARIANT_KIND = "variant" as const;

/** The output kinds from most foundational to most outward; a kind admits itself and every kind before it. */
const OUTPUT_FOUNDATION_ORDER = ["substrate", "capability", "domain", "interface", "surface"] as const;

type VariantKind = typeof VARIANT_KIND;
type SelfDescribedKind = Exclude<SpecTreeNodeKind, VariantKind>;
type OutputFoundationKind = (typeof OUTPUT_FOUNDATION_ORDER)[number];
type NodeFamilyKind = Exclude<SelfDescribedKind, OutputFoundationKind>;

/** The opening keyword the spec states for each self-described kind; the registry supplies only the key set. */
const SPEC_STATED_OPENINGS = {
  substrate: "SUPPLIES",
  capability: "PROVIDES",
  domain: "OWNS",
  interface: "ADAPTS",
  surface: "EXPOSES",
  enabler: "PROVIDES",
  outcome: "WE BELIEVE THAT",
} as const satisfies Record<SelfDescribedKind, string>;

/** The child kinds the spec states each 3.x kind admits; the registry supplies only the key set. */
const SPEC_STATED_NODE_FAMILY_CHILDREN = {
  enabler: ["enabler"],
  outcome: ["enabler", "outcome"],
} as const satisfies Record<NodeFamilyKind, readonly SpecTreeNodeKind[]>;

function openingKeywordOf(kind: SelfDescribedKind): string {
  return SPEC_STATED_OPENINGS[kind];
}

function nodeFamilyChildrenOf(kind: NodeFamilyKind): readonly SpecTreeNodeKind[] {
  return SPEC_STATED_NODE_FAMILY_CHILDREN[kind];
}

export type KindOpeningCase = {
  readonly label: string;
  readonly kind: SpecTreeNodeKind;
  readonly parentKind?: SpecTreeNodeKind;
  readonly expectedOpening: string;
};

export type KindAdmittedChildrenCase = {
  readonly label: string;
  readonly kind: SpecTreeContainerKind;
  readonly parentKind?: SpecTreeNodeKind;
  readonly expectedChildren: readonly SpecTreeChildKind[];
};

const LABEL_PARENT_JOINER = " under a ";

function isSelfDescribed(kind: SpecTreeNodeKind): kind is SelfDescribedKind {
  return kind !== VARIANT_KIND;
}

function foundationIndex(kind: SelfDescribedKind): number {
  return OUTPUT_FOUNDATION_ORDER.findIndex((candidate) => candidate === kind);
}

function expectedChildrenOfSelfDescribed(kind: SelfDescribedKind): readonly SpecTreeChildKind[] {
  const index = foundationIndex(kind);
  if (index < 0) return nodeFamilyChildrenOf(kind as NodeFamilyKind);
  return [...OUTPUT_FOUNDATION_ORDER.slice(0, index + 1), VARIANT_KIND];
}

function everyRegisteredKind(): readonly SpecTreeNodeKind[] {
  return [...NODE_KINDS, ...OUTPUT_KINDS];
}

function variantParentKinds(): readonly SelfDescribedKind[] {
  return OUTPUT_KINDS.filter((kind): kind is Extract<typeof kind, SelfDescribedKind> => isSelfDescribed(kind));
}

/** One case per registered kind, and for the variant one per output kind it can sit under. */
export function kindOpeningCases(): readonly KindOpeningCase[] {
  return everyRegisteredKind().flatMap((kind): readonly KindOpeningCase[] => {
    if (isSelfDescribed(kind)) return [{ label: kind, kind, expectedOpening: openingKeywordOf(kind) }];
    return variantParentKinds().map((parentKind) => ({
      label: [kind, parentKind].join(LABEL_PARENT_JOINER),
      kind,
      parentKind,
      expectedOpening: openingKeywordOf(parentKind),
    }));
  });
}

/** One case per registered kind, one for the product, and for the variant one per output kind it can sit under. */
export function kindAdmittedChildrenCases(): readonly KindAdmittedChildrenCase[] {
  const productCase: KindAdmittedChildrenCase = {
    label: SPEC_TREE_CONFIG.PRODUCT.KIND,
    kind: SPEC_TREE_CONFIG.PRODUCT.KIND,
    expectedChildren: [...OUTPUT_FOUNDATION_ORDER, SPEC_TREE_CONFIG.PRODUCT.KIND],
  };
  const registeredCases = everyRegisteredKind().flatMap((kind): readonly KindAdmittedChildrenCase[] => {
    if (isSelfDescribed(kind)) return [{ label: kind, kind, expectedChildren: expectedChildrenOfSelfDescribed(kind) }];
    return variantParentKinds().map((parentKind) => ({
      label: [kind, parentKind].join(LABEL_PARENT_JOINER),
      kind,
      parentKind,
      expectedChildren: expectedChildrenOfSelfDescribed(parentKind).filter((child) => child !== VARIANT_KIND),
    }));
  });
  return [...registeredCases, productCase];
}
