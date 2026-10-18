import * as fc from "fast-check";

import { SPEC_TREE_PROJECTION, type SpecTreeProjection } from "@/lib/spec-tree";

const REGISTERED_PROJECTION_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(SPEC_TREE_PROJECTION.KEYS),
  ...Object.values(SPEC_TREE_PROJECTION.NODE_KEYS),
  ...Object.values(SPEC_TREE_PROJECTION.DECISION_KEYS),
  ...Object.values(SPEC_TREE_PROJECTION.PRODUCT_KEYS),
]);

/** A field name the projection registry does not name at any level of the document. */
export function arbitraryUnregisteredProjectionKey(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1 }).filter((key) => !REGISTERED_PROJECTION_KEYS.has(key));
}

/**
 * Projections that break the rule that every projection key comes from the registry: each case
 * is a real projection with one key the registry does not name added at one level, or one
 * registered key removed.
 */
export type ProjectionKeyViolations = {
  readonly extraDocumentKey: unknown;
  readonly missingDocumentKey: unknown;
  readonly extraNodeKey: unknown;
  readonly extraDecisionKey: unknown;
  readonly extraProductKey: unknown;
};

/** Derives the violating projections from a real one; the projection must hold a node, a decision, and a product. */
export function projectionKeyViolations(
  projection: SpecTreeProjection,
  unregisteredKey: string,
): ProjectionKeyViolations {
  const node = projection.nodes.at(0);
  const decision = projection.decisions.at(0);
  if (node === undefined || decision === undefined || projection.product === null) {
    throw new Error("Projection holds no node, decision, or product to violate");
  }
  const { [SPEC_TREE_PROJECTION.KEYS.NODES]: _omitted, ...withoutNodes } = projection;
  return {
    extraDocumentKey: { ...projection, [unregisteredKey]: projection.version },
    missingDocumentKey: withoutNodes,
    extraNodeKey: { ...projection, [SPEC_TREE_PROJECTION.KEYS.NODES]: [{ ...node, [unregisteredKey]: node.id }] },
    extraDecisionKey: {
      ...projection,
      [SPEC_TREE_PROJECTION.KEYS.DECISIONS]: [{ ...decision, [unregisteredKey]: decision.id }],
    },
    extraProductKey: {
      ...projection,
      [SPEC_TREE_PROJECTION.KEYS.PRODUCT]: { ...projection.product, [unregisteredKey]: projection.product.id },
    },
  };
}
