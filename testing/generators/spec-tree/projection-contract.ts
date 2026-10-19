import * as fc from "fast-check";

import {
  KIND_REGISTRY,
  type NodeKind,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_KIND_CATEGORY,
  SPEC_TREE_PROJECTION,
  type SpecTreeDecisionSourceEntry,
  type SpecTreeNodeSourceEntry,
  type SpecTreeProjection,
} from "@/lib/spec-tree";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";

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

/** An index path: the numeric segments of one index, so `20.10` is `[20, 10]`. */
type IndexPath = readonly number[];

/**
 * Node and decision source entries whose index paths are known in dependency order by
 * construction. `ordered` lists the paths provider before consumer; the entries carry the same
 * paths in an unrelated arrangement, so the order a projection reports cannot come from the
 * order the entries were supplied in.
 */
export type OrderedIndexScenario = {
  readonly ordered: readonly IndexPath[];
  readonly nodeEntries: readonly SpecTreeNodeSourceEntry[];
  readonly decisionEntries: readonly SpecTreeDecisionSourceEntry[];
};

const INDEX_SEGMENT_MAX = 120;
const INDEX_SEGMENT_STEP_MAX = 40;
const INDEX_EXTENSION_STEPS_MAX = 10;

const INDEX_STEP = {
  NEXT_SIBLING: "next-sibling",
  DESCEND: "descend",
  ASCEND: "ascend",
} as const;

type IndexStep = {
  readonly move: (typeof INDEX_STEP)[keyof typeof INDEX_STEP];
  readonly amount: number;
  readonly segment: number;
};

const arbitraryIndexSegment = (): fc.Arbitrary<number> => fc.integer({ min: 0, max: INDEX_SEGMENT_MAX });

const arbitraryIndexStep = (): fc.Arbitrary<IndexStep> =>
  fc.record({
    move: fc.constantFrom(INDEX_STEP.NEXT_SIBLING, INDEX_STEP.DESCEND, INDEX_STEP.ASCEND),
    amount: fc.integer({ min: 1, max: INDEX_SEGMENT_STEP_MAX }),
    segment: arbitraryIndexSegment(),
  });

/**
 * The index path that follows `path` in dependency order: the next sibling raises the last
 * segment, a descent extends the path (a provider before the indices it prefixes), and an
 * ascent drops the last segment and raises the one before it. Every move yields a path that
 * comes after `path` by this construction, so no comparator decides the sequence.
 */
function successorIndexPath(path: IndexPath, step: IndexStep): IndexPath {
  if (step.move === INDEX_STEP.DESCEND) return [...path, step.segment];
  const kept = step.move === INDEX_STEP.ASCEND && path.length > 1 ? path.slice(0, -1) : path;
  return [...kept.slice(0, -1), kept[kept.length - 1] + step.amount];
}

/**
 * A strictly increasing run of index paths that opens with a single-segment path and its own
 * multi-segment extension, then grows by constructed successors, so numeric segments of
 * different widths and several depths occur together.
 */
function arbitraryOrderedIndexPaths(): fc.Arbitrary<readonly IndexPath[]> {
  return fc
    .record({
      first: arbitraryIndexSegment(),
      extension: arbitraryIndexSegment(),
      steps: fc.array(arbitraryIndexStep(), { maxLength: INDEX_EXTENSION_STEPS_MAX }),
    })
    .map(({ first, extension, steps }) => {
      const ordered: IndexPath[] = [[first], [first, extension]];
      for (const step of steps) {
        ordered.push(successorIndexPath(ordered[ordered.length - 1], step));
      }
      return ordered;
    });
}

function shuffledCopy<T>(items: readonly T[]): fc.Arbitrary<readonly T[]> {
  return fc.shuffledSubarray([...items], { minLength: items.length, maxLength: items.length });
}

function nodeKinds(): readonly NodeKind[] {
  return Object.entries(KIND_REGISTRY)
    .filter(([, definition]) => definition.category === SPEC_TREE_KIND_CATEGORY.NODE)
    .map(([kind]) => kind as NodeKind);
}

function decisionKinds(): readonly SpecTreeDecisionSourceEntry["kind"][] {
  return Object.entries(KIND_REGISTRY)
    .filter(([, definition]) => definition.category === SPEC_TREE_KIND_CATEGORY.DECISION)
    .map(([kind]) => kind as SpecTreeDecisionSourceEntry["kind"]);
}

/**
 * Source entries for one node and one decision per generated index path, each entry in an
 * arrangement independent of the dependency order the scenario records.
 */
export function arbitraryOrderedIndexScenario(): fc.Arbitrary<OrderedIndexScenario> {
  return arbitraryOrderedIndexPaths().chain((ordered) =>
    fc.record({
      nodePaths: shuffledCopy(ordered),
      decisionPaths: shuffledCopy(ordered),
      ids: fc.uniqueArray(SPEC_TREE_TEST_GENERATOR.sourceId(), {
        minLength: ordered.length * 2,
        maxLength: ordered.length * 2,
      }),
      slugs: fc.array(SPEC_TREE_TEST_GENERATOR.sourceSlug(), {
        minLength: ordered.length * 2,
        maxLength: ordered.length * 2,
      }),
      kinds: fc.array(fc.constantFrom(...nodeKinds()), { minLength: ordered.length, maxLength: ordered.length }),
      decisionKinds: fc.array(fc.constantFrom(...decisionKinds()), {
        minLength: ordered.length,
        maxLength: ordered.length,
      }),
    }).map(({ nodePaths, decisionPaths, ids, slugs, kinds, decisionKinds: kindsOfDecisions }) => ({
      ordered,
      nodeEntries: nodePaths.map((orderSegments, position) => ({
        type: SPEC_TREE_ENTRY_TYPE.NODE,
        kind: kinds[position],
        id: ids[position],
        orderSegments,
        slug: slugs[position],
      })),
      decisionEntries: decisionPaths.map((orderSegments, position) => ({
        type: SPEC_TREE_ENTRY_TYPE.DECISION,
        kind: kindsOfDecisions[position],
        id: ids[ordered.length + position],
        orderSegments,
        slug: slugs[ordered.length + position],
      })),
    }))
  );
}
