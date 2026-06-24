import * as fc from "fast-check";

import type {
  NodeClassificationFacts,
  NodeStatusEvidenceOutcome,
  NodeStatusMechanismOverall,
  NodeStatusMechanismRecord,
  NodeStatusVerification,
} from "@/lib/node-status";
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
const STATUS_REFERENCE_MODES = ["scenario", "mapping", "property", "compliance", "conformance"] as const;
const STATUS_REFERENCE_LEVELS = ["l1", "l2", "l3"] as const;
const STATUS_REFERENCE_NAME_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const STATUS_FIELD_OVERALL = "overall";
const STATUS_VERIFICATION_MECHANISM_TEST = "test";
const STATUS_EVIDENCE_OUTCOMES = [
  "passed",
  "failed",
  "not-run",
] as const satisfies readonly NodeStatusEvidenceOutcome[];
const STATUS_MECHANISM_OVERALL_PASSED = "passed" satisfies NodeStatusMechanismOverall;
const STATUS_MECHANISM_OVERALL_FAILED = "failed" satisfies NodeStatusMechanismOverall;
const STATUS_MECHANISM_OVERALL_PARTIAL = "partial" satisfies NodeStatusMechanismOverall;
const STATUS_MECHANISM_OVERALL_NOT_RUN = "not-run" satisfies NodeStatusMechanismOverall;
const SLUG_PATTERN = new RegExp(
  `^[a-z][a-z0-9-]{${NODE_STATUS_GENERATOR_OPTIONS.SLUG_MIN_LENGTH - 1},${
    NODE_STATUS_GENERATOR_OPTIONS.SLUG_MAX_LENGTH - 1
  }}$`,
);

export type ClassificationFixtureFacts = {
  readonly hasVerificationReferences: boolean;
  readonly isExcluded: boolean;
  readonly testsPass: boolean;
};

export type ClassificationTreeNode = {
  readonly dirName: string;
  readonly slug: string;
  readonly facts: ClassificationFixtureFacts;
};

export type ClassificationTreeFixture = {
  readonly nodes: readonly ClassificationTreeNode[];
};

export const NODE_STATUS_TEST_GENERATOR = {
  facts: arbitraryNodeClassificationFacts,
  classificationTree: arbitraryClassificationTree,
  delegationTree: arbitraryDelegationTree,
  statusReference: arbitraryStatusReference,
  evidenceOutcome: arbitraryEvidenceOutcome,
} as const;

export function sampleNodeStatusValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Node-status test generator returned no sample");
  }
  return value;
}

export function arbitraryNodeClassificationFacts(): fc.Arbitrary<NodeClassificationFacts> {
  return fc
    .record({
      hasVerificationReferences: fc.boolean(),
      isExcluded: fc.boolean(),
      reference: arbitraryStatusReference(),
      outcome: arbitraryEvidenceOutcome(),
    })
    .map(({ hasVerificationReferences, isExcluded, reference, outcome }): NodeClassificationFacts => {
      const verification: NodeStatusVerification = hasVerificationReferences
        ? {
          [STATUS_VERIFICATION_MECHANISM_TEST]: independentMechanismRecord({ [reference]: outcome }),
        }
        : {};
      return { hasVerificationReferences, isExcluded, verification };
    });
}

// Human-readable lowercase slugs (e.g. "node-a3"), mirroring the spec-tree
// generator's readable-token convention so counterexamples stay legible. The
// node order is unique per fixture, so node directory names stay unique even
// when two nodes draw the same slug.
function arbitraryNodeSlug(): fc.Arbitrary<string> {
  return fc.stringMatching(SLUG_PATTERN, { maxLength: NODE_STATUS_GENERATOR_OPTIONS.SLUG_MAX_LENGTH });
}

function arbitraryStatusReference(): fc.Arbitrary<string> {
  return fc
    .record({
      name: fc.stringMatching(STATUS_REFERENCE_NAME_PATTERN),
      mode: fc.constantFrom(...STATUS_REFERENCE_MODES),
      level: fc.constantFrom(...STATUS_REFERENCE_LEVELS),
    })
    .map(({ name, mode, level }) => `tests/${name}.${mode}.${level}.test.ts`);
}

function arbitraryEvidenceOutcome(): fc.Arbitrary<NodeStatusEvidenceOutcome> {
  return fc.constantFrom(...STATUS_EVIDENCE_OUTCOMES);
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
            facts: arbitraryClassificationFixtureFacts(),
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

function arbitraryClassificationFixtureFacts(): fc.Arbitrary<ClassificationFixtureFacts> {
  return fc.record({
    hasVerificationReferences: fc.boolean(),
    isExcluded: fc.boolean(),
    testsPass: fc.boolean(),
  });
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
  hasVerificationReferences: boolean,
  isExcluded: boolean,
): fc.Arbitrary<ClassificationTreeNode> {
  return fc
    .record({ slug: arbitraryNodeSlug(), testsPass: fc.boolean() })
    .map(({ slug, testsPass }) => ({
      dirName: `${order}-${slug}${ENABLER_SUFFIX}`,
      slug,
      facts: { hasVerificationReferences, isExcluded, testsPass },
    }));
}

function independentMechanismRecord(
  outcomes: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
): NodeStatusMechanismRecord {
  return {
    [STATUS_FIELD_OVERALL]: independentMechanismOverall(outcomes),
    ...outcomes,
  };
}

function independentMechanismOverall(
  outcomes: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
): NodeStatusMechanismOverall {
  const values = Object.values(outcomes);
  if (values.length === 0) return STATUS_MECHANISM_OVERALL_NOT_RUN;
  if (values.some((outcome) => outcome === "failed")) return STATUS_MECHANISM_OVERALL_FAILED;
  if (values.every((outcome) => outcome === "passed")) return STATUS_MECHANISM_OVERALL_PASSED;
  if (values.every((outcome) => outcome === "not-run")) return STATUS_MECHANISM_OVERALL_NOT_RUN;
  return STATUS_MECHANISM_OVERALL_PARTIAL;
}
