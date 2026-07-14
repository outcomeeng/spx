import * as fc from "fast-check";

import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import type {
  NodeClassificationFacts,
  NodeStatusEvidenceOutcome,
  NodeStatusMechanismRecord,
  NodeStatusVerification,
  NodeStatusVerificationMechanism,
} from "@/lib/node-status";
import {
  createNodeStatusMechanismRecord,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_PATH_GRAMMAR,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
} from "@/lib/node-status";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

const NODE_STATUS_GENERATOR_OPTIONS = {
  ORDER_MIN: 10,
  ORDER_MAX: 99,
  MIN_NODES: 1,
  MAX_NODES: 5,
  FAILURE_EXIT_CODE: 1,
} as const;

const ENABLER_SUFFIX = KIND_REGISTRY.enabler.suffix;
const CONSULTATION_CLASS_COUNT = 3;
export const NODE_STATUS_READABLE_SLUGS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"] as const;
const STATUS_REFERENCE_NAME_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const STATUS_VERIFICATION_MECHANISMS = Object.values(NODE_STATUS_VERIFICATION_MECHANISM);
const STATUS_EVIDENCE_OUTCOMES: readonly NodeStatusEvidenceOutcome[] = Object.values(NODE_STATUS_EVIDENCE_OUTCOME);

export type ClassificationFixtureFacts = {
  readonly hasVerificationReferences: boolean;
  readonly isExcluded: boolean;
  readonly runnerExitCode: number;
  readonly expectedEvidenceOutcome: NodeStatusEvidenceOutcome;
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
  classificationTreeWithVerificationReferences: arbitraryClassificationTreeWithVerificationReferences,
  delegationTree: arbitraryDelegationTree,
  statusReference: arbitraryStatusReference,
  evidenceOutcome: arbitraryEvidenceOutcome,
  verification: arbitraryVerification,
  trackedFile: arbitraryTrackedFile,
  trackedFileSet: arbitraryTrackedFileSet,
  invalidExcludeEntry: arbitraryInvalidExcludeEntry,
  orphanStatusPath: arbitraryOrphanStatusPath,
  untrackedNodeStatusPath: arbitraryUntrackedNodeStatusPath,
} as const;

export function sampleNodeStatusValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Node-status test generator returned no sample");
  }
  return value;
}

export function createGeneratedEvidenceOutcomes(
  values: readonly NodeStatusEvidenceOutcome[],
): Readonly<Record<string, NodeStatusEvidenceOutcome>> {
  const references = sampleNodeStatusValue(
    fc.uniqueArray(arbitraryStatusReference(), {
      minLength: values.length,
      maxLength: values.length,
    }),
  );
  return Object.fromEntries(values.map((outcome, index) => [references[index], outcome]));
}

export function createGeneratedTestVerification(
  values: readonly NodeStatusEvidenceOutcome[],
): NodeStatusVerification {
  return {
    [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord(
      createGeneratedEvidenceOutcomes(values),
    ),
  };
}

export function arbitraryNodeClassificationFacts(): fc.Arbitrary<NodeClassificationFacts> {
  return fc
    .record({
      hasVerificationReferences: fc.boolean(),
      isExcluded: fc.boolean(),
      verification: arbitraryVerification(),
    })
    .map(({ hasVerificationReferences, isExcluded, verification }): NodeClassificationFacts => {
      return { hasVerificationReferences, isExcluded, verification };
    });
}

export function arbitraryVerification(): fc.Arbitrary<NodeStatusVerification> {
  return fc
    .uniqueArray(fc.constantFrom(...STATUS_VERIFICATION_MECHANISMS), { minLength: 1, maxLength: 3 })
    .chain((mechanisms) =>
      fc.tuple(
        ...mechanisms.map((mechanism) => arbitraryMechanismRecord().map((record) => [mechanism, record] as const)),
      )
    )
    .map(verificationFromEntries);
}

function arbitraryNodeSlug(): fc.Arbitrary<string> {
  return fc.constantFrom(...NODE_STATUS_READABLE_SLUGS);
}

function arbitraryStatusReference(): fc.Arbitrary<string> {
  return fc
    .record({
      name: fc.stringMatching(STATUS_REFERENCE_NAME_PATTERN),
      mode: fc.constantFrom(...SPEC_TREE_GRAMMAR.EVIDENCE.MODES),
      level: fc.constantFrom(...SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS),
    })
    .map(({ name, mode, level }) => `tests/${name}.${mode}.${level}.test.ts`);
}

function arbitraryEvidenceOutcome(): fc.Arbitrary<NodeStatusEvidenceOutcome> {
  return fc.constantFrom(...STATUS_EVIDENCE_OUTCOMES);
}

function arbitraryTrackedFile(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryNodeSlug(), { minLength: 1, maxLength: 4 })
    .map((segments) => segments.join(TRACKED_PATH_DIRECTORY_SEPARATOR));
}

function arbitraryTrackedFileSet(): fc.Arbitrary<ReadonlySet<string>> {
  return fc
    .array(arbitraryTrackedFile(), { minLength: 0, maxLength: 6 })
    .map((files) => new Set(files));
}

function arbitraryInvalidExcludeEntry(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryNodeSlug().map((slug) => `${NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR}${slug}`),
    fc.tuple(arbitraryNodeSlug(), arbitraryNodeSlug()).map(([parent, child]) =>
      [parent, NODE_STATUS_EXCLUDE_PATH_GRAMMAR.CURRENT_DIRECTORY_SEGMENT, child].join(
        NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR,
      )
    ),
    arbitraryNodeSlug().map((slug) =>
      [NODE_STATUS_EXCLUDE_PATH_GRAMMAR.PARENT_DIRECTORY_SEGMENT, slug].join(
        NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR,
      )
    ),
    fc.tuple(arbitraryNodeSlug(), arbitraryNodeSlug()).map(([parent, child]) =>
      [parent, child].join(
        NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR.repeat(2),
      )
    ),
  );
}

function arbitraryOrphanStatusPath(): fc.Arbitrary<string> {
  return arbitraryNodeSlug().map((slug) =>
    [SPEC_TREE_CONFIG.ROOT_DIRECTORY, slug, NODE_STATUS_FILENAME].join(
      NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR,
    )
  );
}

function arbitraryUntrackedNodeStatusPath(takenNodeIds: readonly string[] = []): fc.Arbitrary<string> {
  return fc
    .record({
      order: fc.integer({ min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN, max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX }),
      slug: arbitraryNodeSlug(),
    })
    .map(({ order, slug }) => `${order}-${slug}${ENABLER_SUFFIX}`)
    .filter((nodeId) => !takenNodeIds.includes(nodeId))
    .map((nodeId) =>
      [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, NODE_STATUS_FILENAME].join(
        NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR,
      )
    );
}

function arbitraryMechanismRecord(): fc.Arbitrary<NodeStatusMechanismRecord> {
  return fc
    .uniqueArray(arbitraryStatusReference(), { minLength: 1, maxLength: 4 })
    .chain((references) =>
      fc.tuple(
        ...references.map((reference) => arbitraryEvidenceOutcome().map((outcome) => [reference, outcome] as const)),
      )
    )
    .map((entries) => createNodeStatusMechanismRecord(outcomesFromEntries(entries)));
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

export function arbitraryClassificationTreeWithVerificationReferences(): fc.Arbitrary<ClassificationTreeFixture> {
  return arbitraryClassificationTree().filter((fixture) =>
    fixture.nodes.some((node) => node.facts.hasVerificationReferences)
  );
}

function arbitraryClassificationFixtureFacts(): fc.Arbitrary<ClassificationFixtureFacts> {
  return fc
    .record({
      hasVerificationReferences: fc.boolean(),
      isExcluded: fc.boolean(),
      runnerPassed: fc.boolean(),
    })
    .map(({ hasVerificationReferences, isExcluded, runnerPassed }) => ({
      hasVerificationReferences,
      isExcluded,
      runnerExitCode: runnerPassed ? SUCCESS_EXIT_CODE : NODE_STATUS_GENERATOR_OPTIONS.FAILURE_EXIT_CODE,
      expectedEvidenceOutcome: isExcluded
        ? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN
        : runnerPassed
        ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
        : NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
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
  hasVerificationReferences: boolean,
  isExcluded: boolean,
): fc.Arbitrary<ClassificationTreeNode> {
  return fc
    .record({ slug: arbitraryNodeSlug(), runnerPassed: fc.boolean() })
    .map(({ slug, runnerPassed }) => ({
      dirName: `${order}-${slug}${ENABLER_SUFFIX}`,
      slug,
      facts: {
        hasVerificationReferences,
        isExcluded,
        runnerExitCode: runnerPassed ? SUCCESS_EXIT_CODE : NODE_STATUS_GENERATOR_OPTIONS.FAILURE_EXIT_CODE,
        expectedEvidenceOutcome: isExcluded
          ? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN
          : runnerPassed
          ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
          : NODE_STATUS_EVIDENCE_OUTCOME.FAILED,
      },
    }));
}

function outcomesFromEntries(
  entries: readonly (readonly [string, NodeStatusEvidenceOutcome])[],
): Record<string, NodeStatusEvidenceOutcome> {
  const outcomes: Record<string, NodeStatusEvidenceOutcome> = {};
  for (const [reference, outcome] of entries) {
    outcomes[reference] = outcome;
  }
  return outcomes;
}

function verificationFromEntries(
  entries: readonly (readonly [NodeStatusVerificationMechanism, NodeStatusMechanismRecord])[],
): NodeStatusVerification {
  const verification: Partial<Record<NodeStatusVerificationMechanism, NodeStatusMechanismRecord>> = {};
  for (const [mechanism, record] of entries) {
    verification[mechanism] = record;
  }
  return verification;
}
