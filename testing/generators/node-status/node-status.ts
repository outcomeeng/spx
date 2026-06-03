import * as fc from "fast-check";

import type { NodeClassificationFacts } from "@/lib/node-status";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";

const NODE_STATUS_GENERATOR_OPTIONS = {
  ORDER_MIN: 10,
  ORDER_MAX: 99,
  MIN_NODES: 1,
  MAX_NODES: 5,
  SLUG_MIN_LENGTH: 3,
  SLUG_MAX_LENGTH: 12,
} as const;

const ENABLER_SUFFIX = KIND_REGISTRY.enabler.suffix;
const CONSULTATION_CLASS_COUNT = 3;
const SLUG_PATTERN = new RegExp(
  `^[a-z][a-z0-9-]{${NODE_STATUS_GENERATOR_OPTIONS.SLUG_MIN_LENGTH - 1},${
    NODE_STATUS_GENERATOR_OPTIONS.SLUG_MAX_LENGTH - 1
  }}$`,
);

export type ClassificationTreeNode = {
  readonly dirName: string;
  readonly slug: string;
  readonly facts: NodeClassificationFacts;
};

export type ClassificationTreeFixture = {
  readonly nodes: readonly ClassificationTreeNode[];
};

export const NODE_STATUS_TEST_GENERATOR = {
  facts: arbitraryNodeClassificationFacts,
  classificationTree: arbitraryClassificationTree,
  delegationTree: arbitraryDelegationTree,
} as const;

export function sampleNodeStatusValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Node-status test generator returned no sample");
  }
  return value;
}

export function arbitraryNodeClassificationFacts(): fc.Arbitrary<NodeClassificationFacts> {
  return fc.record({
    hasTests: fc.boolean(),
    isExcluded: fc.boolean(),
    testsPass: fc.boolean(),
  });
}

// Human-readable lowercase slugs (e.g. "node-a3"), mirroring the spec-tree
// generator's readable-token convention so counterexamples stay legible. The
// node order is unique per fixture, so node directory names stay unique even
// when two nodes draw the same slug.
function arbitraryNodeSlug(): fc.Arbitrary<string> {
  return fc.stringMatching(SLUG_PATTERN, { maxLength: NODE_STATUS_GENERATOR_OPTIONS.SLUG_MAX_LENGTH });
}

export function arbitraryClassificationTree(): fc.Arbitrary<ClassificationTreeFixture> {
  return fc
    .uniqueArray(
      fc.integer({ min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN, max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX }),
      { minLength: NODE_STATUS_GENERATOR_OPTIONS.MIN_NODES, maxLength: NODE_STATUS_GENERATOR_OPTIONS.MAX_NODES },
    )
    .chain((orders) =>
      fc.tuple(
        ...orders.map((order) =>
          fc.record({
            order: fc.constant(order),
            slug: arbitraryNodeSlug(),
            facts: arbitraryNodeClassificationFacts(),
          })
        ),
      )
    )
    .map((entries) => ({
      nodes: entries.map(({ order, slug, facts }) => ({
        dirName: `${order}-${slug}${ENABLER_SUFFIX}`,
        slug,
        facts,
      })),
    }));
}

// A classification tree guaranteed to span all three consultation classes — one
// test-outcome-stage node (co-located tests, not excluded), one declared (no
// tests), and one specified (excluded) — so a delegation assertion always has a
// discriminating partition rather than degenerating on an all-structural draw.
export function arbitraryDelegationTree(): fc.Arbitrary<ClassificationTreeFixture> {
  return fc
    .uniqueArray(
      fc.integer({ min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN, max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX }),
      { minLength: CONSULTATION_CLASS_COUNT, maxLength: CONSULTATION_CLASS_COUNT },
    )
    .chain(([stageOrder, declaredOrder, specifiedOrder]) =>
      fc.tuple(
        delegationNode(stageOrder, true, false),
        delegationNode(declaredOrder, false, false),
        delegationNode(specifiedOrder, true, true),
      )
    )
    .map((nodes) => ({ nodes }));
}

function delegationNode(
  order: number,
  hasTests: boolean,
  isExcluded: boolean,
): fc.Arbitrary<ClassificationTreeNode> {
  return fc
    .record({ slug: arbitraryNodeSlug(), testsPass: fc.boolean() })
    .map(({ slug, testsPass }) => ({
      dirName: `${order}-${slug}${ENABLER_SUFFIX}`,
      slug,
      facts: { hasTests, isExcluded, testsPass },
    }));
}
