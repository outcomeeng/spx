/**
 * Cases and construction-derived expectations for the kind grammar: the opening keyword each
 * node kind resolves and the child kinds each node kind admits.
 *
 * The domain of every case is the registered node and output kinds, taken from the library
 * surface. The expectations come from the relationships the filename-grammar spec declares —
 * a keyword per kind, a foundation order over the output kinds, and a variant that takes its
 * parent's place — and from no registry field the library resolves them through.
 *
 * @module generators/spec-tree/kind-grammar
 */

import { NODE_KINDS, OUTPUT_KINDS, type SpecTreeNodeKind } from "@/lib/spec-tree";

const VARIANT_KIND = "variant" as const;

/** The output kinds from most foundational to most outward; a kind admits itself and every kind before it. */
const OUTPUT_FOUNDATION_ORDER = ["substrate", "capability", "domain", "interface", "surface"] as const;

type VariantKind = typeof VARIANT_KIND;
type SelfDescribedKind = Exclude<SpecTreeNodeKind, VariantKind>;
type OutputFoundationKind = (typeof OUTPUT_FOUNDATION_ORDER)[number];
type NodeFamilyKind = Exclude<SelfDescribedKind, OutputFoundationKind>;

const OPENING_KEYWORD: Readonly<Record<SelfDescribedKind, string>> = {
  substrate: "SUPPLIES",
  capability: "PROVIDES",
  domain: "OWNS",
  interface: "ADAPTS",
  surface: "EXPOSES",
  enabler: "PROVIDES",
  outcome: "WE BELIEVE THAT",
};

const NODE_FAMILY_CHILDREN: Readonly<Record<NodeFamilyKind, readonly SpecTreeNodeKind[]>> = {
  enabler: ["enabler"],
  outcome: ["enabler", "outcome"],
};

export type KindOpeningCase = {
  readonly label: string;
  readonly kind: SpecTreeNodeKind;
  readonly parentKind?: SpecTreeNodeKind;
  readonly expectedOpening: string;
};

export type KindAdmittedChildrenCase = {
  readonly label: string;
  readonly kind: SpecTreeNodeKind;
  readonly parentKind?: SpecTreeNodeKind;
  readonly expectedChildren: readonly SpecTreeNodeKind[];
};

const LABEL_PARENT_JOINER = " under a ";

function isSelfDescribed(kind: SpecTreeNodeKind): kind is SelfDescribedKind {
  return kind !== VARIANT_KIND;
}

function foundationIndex(kind: SelfDescribedKind): number {
  return OUTPUT_FOUNDATION_ORDER.findIndex((candidate) => candidate === kind);
}

function expectedChildrenOfSelfDescribed(kind: SelfDescribedKind): readonly SpecTreeNodeKind[] {
  const index = foundationIndex(kind);
  if (index < 0) return NODE_FAMILY_CHILDREN[kind as NodeFamilyKind];
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
    if (isSelfDescribed(kind)) return [{ label: kind, kind, expectedOpening: OPENING_KEYWORD[kind] }];
    return variantParentKinds().map((parentKind) => ({
      label: [kind, parentKind].join(LABEL_PARENT_JOINER),
      kind,
      parentKind,
      expectedOpening: OPENING_KEYWORD[parentKind],
    }));
  });
}

/** One case per registered kind, and for the variant one per output kind it can sit under. */
export function kindAdmittedChildrenCases(): readonly KindAdmittedChildrenCase[] {
  return everyRegisteredKind().flatMap((kind): readonly KindAdmittedChildrenCase[] => {
    if (isSelfDescribed(kind)) return [{ label: kind, kind, expectedChildren: expectedChildrenOfSelfDescribed(kind) }];
    return variantParentKinds().map((parentKind) => ({
      label: [kind, parentKind].join(LABEL_PARENT_JOINER),
      kind,
      parentKind,
      expectedChildren: expectedChildrenOfSelfDescribed(parentKind).filter((child) => child !== VARIANT_KIND),
    }));
  });
}
