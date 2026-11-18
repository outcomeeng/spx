/**
 * Generators and the construction law behind the evidence-attribution mapping: a three-level node chain, every
 * subject a sealed audit unit can have inside it, and the Node that owns each subject.
 *
 * @module testing/generators/node-status/evidence-attribution
 */
import * as fc from "fast-check";

import { SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { NODE_STATUS_READABLE_SLUGS, nodeDirectoryName } from "@testing/generators/node-status/node-status";

const PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;
const ORDER_MIN = 10;
const ORDER_MAX = 99;
const SOURCE_DIRECTORY = "src";
const SOURCE_EXTENSION = ".ts";

/** The position of a Node in the chain: the chain nests grandparent, parent, child. */
export const ATTRIBUTION_ROLE = {
  GRANDPARENT: "grandparent",
  PARENT: "parent",
  CHILD: "child",
} as const;

export type AttributionRole = (typeof ATTRIBUTION_ROLE)[keyof typeof ATTRIBUTION_ROLE];

/** The roles from the outermost Node to the innermost. */
export const ATTRIBUTION_ROLES_OUTSIDE_IN: readonly AttributionRole[] = [
  ATTRIBUTION_ROLE.GRANDPARENT,
  ATTRIBUTION_ROLE.PARENT,
  ATTRIBUTION_ROLE.CHILD,
];

/** What a sealed audit unit's subject is, relative to the Node that holds it. */
export const ATTRIBUTION_SUBJECT_KIND = {
  TESTS_FILE: "tests-file",
  NODE_DIRECTORY: "node-directory",
  SPEC: "spec",
} as const;

export type AttributionSubjectKind = (typeof ATTRIBUTION_SUBJECT_KIND)[keyof typeof ATTRIBUTION_SUBJECT_KIND];

/** The directory names and slugs of a node chain, and the tracked source file an audit judges. */
export interface AttributionTreeFixture {
  readonly nodes: Readonly<Record<AttributionRole, { readonly dirName: string; readonly slug: string }>>;
  readonly sourcePath: string;
}

/** One subject a sealed audit unit can have: the kind of path and the Node that holds it as its own. */
export interface AttributionSubjectCase {
  readonly kind: AttributionSubjectKind;
  readonly holder: AttributionRole;
}

/** A node chain with distinct slugs, each node at any index, and a source slug distinct from every node slug. */
export function arbitraryAttributionTree(): fc.Arbitrary<AttributionTreeFixture> {
  const order = fc.integer({ min: ORDER_MIN, max: ORDER_MAX });
  return fc
    .tuple(
      fc.shuffledSubarray([...NODE_STATUS_READABLE_SLUGS], { minLength: 4, maxLength: 4 }),
      fc.tuple(order, order, order),
    )
    .map(([slugs, orders]): AttributionTreeFixture => {
      const [grandparent = "", parent = "", child = "", source = ""] = slugs;
      const [grandparentOrder = 0, parentOrder = 0, childOrder = 0] = orders;
      return {
        nodes: {
          [ATTRIBUTION_ROLE.GRANDPARENT]: {
            dirName: nodeDirectoryName(grandparentOrder, grandparent),
            slug: grandparent,
          },
          [ATTRIBUTION_ROLE.PARENT]: { dirName: nodeDirectoryName(parentOrder, parent), slug: parent },
          [ATTRIBUTION_ROLE.CHILD]: { dirName: nodeDirectoryName(childOrder, child), slug: child },
        },
        sourcePath: `${SOURCE_DIRECTORY}${PATH_SEPARATOR}${source}${SOURCE_EXTENSION}`,
      };
    });
}

/** Every subject a sealed audit unit can have inside the chain: each kind of path under each Node. */
export function attributionSubjectCases(): readonly AttributionSubjectCase[] {
  return Object.values(ATTRIBUTION_SUBJECT_KIND).flatMap((kind) =>
    ATTRIBUTION_ROLES_OUTSIDE_IN.map((holder): AttributionSubjectCase => ({ kind, holder }))
  );
}

/**
 * The Node nearest a subject: the Node whose directory holds the subject while no descendant Node's directory
 * holds it. A directory holds the paths beneath it and is held by itself.
 */
export function nearestNodePath(subject: string, nodePaths: readonly string[]): string | undefined {
  const holding = nodePaths.filter((nodePath) =>
    subject === nodePath || subject.startsWith(`${nodePath}${PATH_SEPARATOR}`)
  );
  return holding.reduce<string | undefined>(
    (nearest, candidate) => nearest === undefined || candidate.length > nearest.length ? candidate : nearest,
    undefined,
  );
}
