/**
 * The stable projection contract's value-shape oracle.
 *
 * The oracle declares what each projected field may hold, field by field, independently of
 * `projectSpecTree`: a node carries a string id, a node kind, an array of numeric order segments,
 * a string slug, a node state, and an array of nodes; a decision carries an id, a decision kind,
 * order segments, and a slug; a product carries an id and a title; the document carries the
 * contract version. Field names come from the projection registry and the kind and state
 * vocabularies from their owning registries, so the oracle checks value shape and key membership
 * and holds no second spelling of either. Every object is strict: a key the registry does not name
 * fails.
 *
 * The harness hands the linked test the validator and the observations it asserts over: the
 * projection of the representative tree beside the fixture that produced it, and the projection
 * of any source entries. The test owns every predicate over them.
 *
 * @module testing/harnesses/spec-tree/projection-contract
 */

import { z } from "zod";

import {
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_NODE_STATE,
  SPEC_TREE_PROJECTION,
  type SpecTreeProjection,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";

const NODE_KIND_CATEGORIES: readonly string[] = [SPEC_TREE_KIND_CATEGORY.NODE, SPEC_TREE_KIND_CATEGORY.OUTPUT];

function kindsOfCategories(categories: readonly string[]): readonly string[] {
  return Object.entries(KIND_REGISTRY)
    .filter(([, definition]) => categories.includes(definition.category))
    .map(([kind]) => kind);
}

const CONTAINER_KINDS: readonly string[] = [...kindsOfCategories(NODE_KIND_CATEGORIES), SPEC_TREE_CONFIG.PRODUCT.KIND];
const DECISION_KINDS: readonly string[] = kindsOfCategories([SPEC_TREE_KIND_CATEGORY.DECISION]);
const NODE_STATES: readonly string[] = Object.values(SPEC_TREE_NODE_STATE);

const memberOf = (vocabulary: readonly string[]) => z.string().refine((value) => vocabulary.includes(value));

const orderSegments = z.array(z.number().int().nonnegative());

const { KEYS, NODE_KEYS, DECISION_KEYS, PRODUCT_KEYS } = SPEC_TREE_PROJECTION;

type ProjectedNodeShape = {
  readonly [K in (typeof NODE_KEYS)[keyof typeof NODE_KEYS]]: unknown;
};

const projectedNodeSchema: z.ZodType<ProjectedNodeShape> = z.lazy(() =>
  z.strictObject({
    [NODE_KEYS.ID]: z.string(),
    [NODE_KEYS.KIND]: memberOf(CONTAINER_KINDS),
    [NODE_KEYS.ORDER]: orderSegments,
    [NODE_KEYS.SLUG]: z.string(),
    [NODE_KEYS.STATE]: memberOf(NODE_STATES),
    [NODE_KEYS.CHILDREN]: z.array(projectedNodeSchema),
  })
);

const projectedDecisionSchema = z.strictObject({
  [DECISION_KEYS.ID]: z.string(),
  [DECISION_KEYS.KIND]: memberOf(DECISION_KINDS),
  [DECISION_KEYS.ORDER]: orderSegments,
  [DECISION_KEYS.SLUG]: z.string(),
});

const projectedProductSchema = z.strictObject({
  [PRODUCT_KEYS.ID]: z.string(),
  [PRODUCT_KEYS.TITLE]: z.string(),
});

/** Validates a value against the stable projection contract; `safeParse` reports every violated field. */
export const SPEC_TREE_PROJECTION_CONTRACT = z.strictObject({
  [KEYS.VERSION]: z.literal(SPEC_TREE_PROJECTION.VERSION),
  [KEYS.PRODUCT]: projectedProductSchema.nullable(),
  [KEYS.NODES]: z.array(projectedNodeSchema),
  [KEYS.DECISIONS]: z.array(projectedDecisionSchema),
});

/** Reads the entries into a snapshot and returns its projection. */
export async function observeProjection(entries: readonly SpecTreeSourceEntry[]): Promise<SpecTreeProjection> {
  const snapshot = await readSpecTree({ source: createSource(entries) });
  return projectSpecTree(snapshot);
}

/** The projection of the representative tree, with the fixture it was projected from. */
export async function observeRepresentativeProjection() {
  const fixture = buildRepresentativeFixture(KIND_REGISTRY);
  return { fixture, projection: await observeProjection(fixture.entries) };
}
