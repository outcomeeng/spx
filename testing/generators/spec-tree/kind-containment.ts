/**
 * Cases for kind containment in spec-tree assembly: every parent-kind and child-kind pair one
 * naming-schema version accepts, and every pair no single naming-schema version accepts.
 *
 * The domain of each case comes from the naming-schema versions' own node suffixes. The expected
 * outcome of a same-version pair comes from the admitted-children law in `kind-grammar`, which is
 * stated from the methodology's foundation order and from no field of the kind registry. A
 * cross-version pair expects assembly whatever that law says.
 *
 * @module generators/spec-tree/kind-containment
 */

import {
  KIND_REGISTRY,
  type NamingSchemaVersion,
  NODE_KINDS,
  OUTPUT_KINDS,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_METHODOLOGY_LINE,
  type SpecTreeContainerKind,
  type SpecTreeNodeSourceEntry,
} from "@/lib/spec-tree";
import { type KindAdmittedChildrenCase, kindAdmittedChildrenCases } from "@testing/generators/spec-tree/kind-grammar";
import { specTreeGrammarSelectionForLine } from "@testing/generators/spec-tree/spec-tree";

const CONTAINMENT_ORDER = 10;
const ORDER_SEPARATOR = SPEC_TREE_GRAMMAR.ORDER.SEPARATOR;
const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const LABEL_PARENT_JOINER = " under a ";
const LABEL_VERSION_JOINER = " in naming-schema version ";

/** Slugs that name no kind, so a diagnostic naming a kind names it by the kind and never by the slug. */
const ROLE_SLUG = {
  GRANDPARENT: "alpha",
  PARENT: "beta",
  CHILD: "gamma",
} as const;

export type ContainmentLayoutNode = {
  readonly kind: SpecTreeContainerKind;
  readonly slug: string;
  /** The node directory's path below the spec-tree root directory. */
  readonly directoryPath: string;
  readonly parentSlug?: string;
};

/** A chain of nested nodes ending in the child, with the parent as the child's direct ancestor. */
export type ContainmentLayout = {
  readonly nodes: readonly ContainmentLayoutNode[];
  readonly parent: ContainmentLayoutNode;
  readonly child: ContainmentLayoutNode;
};

export type KindContainmentCase = {
  readonly label: string;
  readonly layout: ContainmentLayout;
  readonly admitted: boolean;
};

function suffixOf(kind: SpecTreeContainerKind): string {
  return kind === SPEC_TREE_CONFIG.PRODUCT.KIND ? SPEC_TREE_CONFIG.PRODUCT.NODE_SUFFIX : KIND_REGISTRY[kind].suffix;
}

function everyContainerKind(): readonly SpecTreeContainerKind[] {
  return [...NODE_KINDS, ...OUTPUT_KINDS, SPEC_TREE_CONFIG.PRODUCT.KIND];
}

function kindsAcceptedBy(version: NamingSchemaVersion): readonly SpecTreeContainerKind[] {
  return everyContainerKind().filter((kind) => version.nodeSuffixes.includes(suffixOf(kind)));
}

function directoryName(kind: SpecTreeContainerKind, slug: string): string {
  return `${CONTAINMENT_ORDER}${ORDER_SEPARATOR}${slug}${suffixOf(kind)}`;
}

function layoutFor(parentCase: KindAdmittedChildrenCase, childKind: SpecTreeContainerKind): ContainmentLayout {
  const chain: { kind: SpecTreeContainerKind; slug: string }[] = [];
  if (parentCase.parentKind !== undefined) {
    chain.push({ kind: parentCase.parentKind, slug: ROLE_SLUG.GRANDPARENT });
  }
  chain.push({ kind: parentCase.kind, slug: ROLE_SLUG.PARENT }, { kind: childKind, slug: ROLE_SLUG.CHILD });
  const nodes: ContainmentLayoutNode[] = [];
  for (const [index, link] of chain.entries()) {
    const parent: ContainmentLayoutNode | undefined = index === 0 ? undefined : nodes[index - 1];
    nodes.push({
      kind: link.kind,
      slug: link.slug,
      directoryPath: [...(parent === undefined ? [] : [parent.directoryPath]), directoryName(link.kind, link.slug)]
        .join(PATH_SEPARATOR),
      parentSlug: parent?.slug,
    });
  }
  return { nodes, parent: nodes[nodes.length - 2], child: nodes[nodes.length - 1] };
}

function parentCaseLabel(parentCase: KindAdmittedChildrenCase, childKind: SpecTreeContainerKind): string {
  return `${childKind}${LABEL_PARENT_JOINER}${parentCase.label}`;
}

/**
 * One case per parent kind and child kind a single naming-schema version accepts, for each version
 * a single methodology line selects. A variant parent sits under each output kind it can sit under.
 */
export function sameVersionContainmentCases(): readonly KindContainmentCase[] {
  return [SPEC_TREE_METHODOLOGY_LINE.THREE_TWO, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO].flatMap((line) =>
    specTreeGrammarSelectionForLine(line).selected.flatMap((version) => {
      const accepted = kindsAcceptedBy(version);
      return kindAdmittedChildrenCases()
        .filter((parentCase) =>
          accepted.includes(parentCase.kind)
          && (parentCase.parentKind === undefined || accepted.includes(parentCase.parentKind))
        )
        .flatMap((parentCase) =>
          accepted.map((childKind): KindContainmentCase => ({
            label: `${parentCaseLabel(parentCase, childKind)}${LABEL_VERSION_JOINER}${version.version}`,
            layout: layoutFor(parentCase, childKind),
            admitted: parentCase.expectedChildren.includes(childKind),
          }))
        );
    })
  );
}

/**
 * One case per parent kind and child kind that no single selected naming-schema version accepts
 * together, whose pair the admitted-children law rejects: the pairs a judge blind to naming-schema
 * versions would refuse. The selection is a 4.0 target with a 3.2 migration source.
 */
export function crossVersionContainmentCases(): readonly KindContainmentCase[] {
  const selected = [SPEC_TREE_METHODOLOGY_LINE.THREE_TWO, SPEC_TREE_METHODOLOGY_LINE.FOUR_ZERO].flatMap((line) =>
    specTreeGrammarSelectionForLine(line).selected
  );
  const acceptedByAny = (kind: SpecTreeContainerKind): boolean =>
    selected.some((version) => kindsAcceptedBy(version).includes(kind));
  const acceptedTogether = (left: SpecTreeContainerKind, right: SpecTreeContainerKind): boolean =>
    selected.some((version) => {
      const accepted = kindsAcceptedBy(version);
      return accepted.includes(left) && accepted.includes(right);
    });
  return kindAdmittedChildrenCases()
    .filter((parentCase) => acceptedByAny(parentCase.kind))
    .flatMap((parentCase) =>
      everyContainerKind()
        .filter((childKind) =>
          acceptedByAny(childKind)
          && !acceptedTogether(parentCase.kind, childKind)
          && !parentCase.expectedChildren.includes(childKind)
        )
        .map((childKind): KindContainmentCase => ({
          label: parentCaseLabel(parentCase, childKind),
          layout: layoutFor(parentCase, childKind),
          admitted: false,
        }))
    );
}

/** The node entries a memory source yields for a layout, each node's id being its slug. */
export function containmentLayoutEntries(layout: ContainmentLayout): readonly SpecTreeNodeSourceEntry[] {
  return layout.nodes.map((node): SpecTreeNodeSourceEntry => ({
    type: SPEC_TREE_ENTRY_TYPE.NODE,
    kind: node.kind,
    id: node.slug,
    orderSegments: [CONTAINMENT_ORDER],
    slug: node.slug,
    parentId: node.parentSlug,
  }));
}
