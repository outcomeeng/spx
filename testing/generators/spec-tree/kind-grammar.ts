/**
 * Cases and construction-derived expectations for the kind grammar: the kinds that can parent a
 * variant, and the child kinds each 4.0 output kind, the variant, and the product admit.
 *
 * The domain of every case is the output kinds the spec declares, in the foundation order it
 * states, so a registry that reclassifies a kind leaves the domain standing. The expected children come from the filename-grammar spec's containment statement and from no
 * field of the kind registry: a foundation order over the output kinds fixes what each admits,
 * and a variant takes its parent's place.
 *
 * @module generators/spec-tree/kind-grammar
 */

import { SPEC_TREE_CONFIG, type SpecTreeContainerKind, type SpecTreeNodeKind } from "@/lib/spec-tree";

export const VARIANT_KIND = "variant" as const;

/** The output kinds from most foundational to most outward; a kind admits itself and every kind before it. */
const OUTPUT_FOUNDATION_ORDER = ["substrate", "capability", "domain", "interface", "surface"] as const;

type OutputFoundationKind = (typeof OUTPUT_FOUNDATION_ORDER)[number];

export type VariantParentCase = {
  readonly label: string;
  readonly parentKind: SpecTreeNodeKind;
};

export type KindOpeningCase = {
  readonly label: string;
  readonly kind: SpecTreeNodeKind;
  readonly expectedOpening: string;
};

/** The opening keyword each non-variant node kind carries, as the methodology states it; a variant takes its parent's. */
const KIND_OPENING_STATEMENT: readonly KindOpeningCase[] = [
  { kind: "substrate", expectedOpening: "SUPPLIES" },
  { kind: "capability", expectedOpening: "PROVIDES" },
  { kind: "domain", expectedOpening: "OWNS" },
  { kind: "interface", expectedOpening: "ADAPTS" },
  { kind: "surface", expectedOpening: "EXPOSES" },
  { kind: "enabler", expectedOpening: "PROVIDES" },
  { kind: "outcome", expectedOpening: "WE BELIEVE THAT" },
].map(({ kind, expectedOpening }) => ({ label: kind, kind: kind as SpecTreeNodeKind, expectedOpening }));

/** One case per non-variant node kind of either grammar, pairing it with the opening keyword the methodology states for it. */
export function kindOpeningCases(): readonly KindOpeningCase[] {
  return KIND_OPENING_STATEMENT;
}

export type KindAdmittedChildrenCase = {
  readonly label: string;
  readonly kind: SpecTreeContainerKind;
  readonly parentKind?: SpecTreeNodeKind;
  readonly expectedChildren: readonly SpecTreeContainerKind[];
};

const LABEL_PARENT_JOINER = " under a ";

function foundationChildrenOf(kind: OutputFoundationKind): readonly SpecTreeContainerKind[] {
  const index = OUTPUT_FOUNDATION_ORDER.findIndex((candidate) => candidate === kind);
  return [...OUTPUT_FOUNDATION_ORDER.slice(0, index + 1), VARIANT_KIND];
}

/** Every declared output kind that can parent a variant: each output kind except the variant itself. */
export function variantParentKinds(): readonly OutputFoundationKind[] {
  return OUTPUT_FOUNDATION_ORDER;
}

/** One case per output kind a variant can sit under. */
export function variantParentCases(): readonly VariantParentCase[] {
  return variantParentKinds().map((parentKind) => ({
    label: [VARIANT_KIND, parentKind].join(LABEL_PARENT_JOINER),
    parentKind,
  }));
}

/** One case per 4.0 output kind, the 3.x enabler and outcome, the product, and the variant under each output kind it can sit under. */
export function kindAdmittedChildrenCases(): readonly KindAdmittedChildrenCase[] {
  const productCase: KindAdmittedChildrenCase = {
    label: SPEC_TREE_CONFIG.PRODUCT.KIND,
    kind: SPEC_TREE_CONFIG.PRODUCT.KIND,
    expectedChildren: [...OUTPUT_FOUNDATION_ORDER, SPEC_TREE_CONFIG.PRODUCT.KIND, "enabler", "outcome"],
  };
  const outputCases = variantParentKinds().map((kind): KindAdmittedChildrenCase => ({
    label: kind,
    kind,
    expectedChildren: foundationChildrenOf(kind),
  }));
  const variantCases = variantParentKinds().map((parentKind): KindAdmittedChildrenCase => ({
    label: [VARIANT_KIND, parentKind].join(LABEL_PARENT_JOINER),
    kind: VARIANT_KIND,
    parentKind,
    expectedChildren: foundationChildrenOf(parentKind).filter((child) => child !== VARIANT_KIND),
  }));
  const priorGrammarCases: readonly KindAdmittedChildrenCase[] = [
    { label: "enabler", kind: "enabler", expectedChildren: ["enabler"] },
    { label: "outcome", kind: "outcome", expectedChildren: ["enabler", "outcome"] },
  ];
  return [...outputCases, ...variantCases, ...priorGrammarCases, productCase];
}
