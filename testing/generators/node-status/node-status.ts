import * as fc from "fast-check";

import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import type {
  NodeClassificationFacts,
  NodeStatusEvidenceOutcome,
  NodeStatusFile,
  NodeStatusMechanismOverall,
  NodeStatusMechanismRecord,
  NodeStatusVerification,
  NodeStatusVerificationMechanism,
} from "@/lib/node-status";
import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_EXCLUDE_PATH_GRAMMAR,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
} from "@/lib/node-status";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

const NODE_STATUS_GENERATOR_OPTIONS = {
  ORDER_MIN: 10,
  ORDER_MAX: 99,
  MIN_NODES: 1,
  MAX_NODES: 5,
  FAILURE_EXIT_CODE: 1,
  /** Highest count of any one outcome in an enumerated rollup multiset. */
  MAX_OUTCOME_MULTIPLICITY: 3,
} as const;

const ENABLER_SUFFIX = KIND_REGISTRY.enabler.suffix;
const CONSULTATION_CLASS_COUNT = 3;
export const NODE_STATUS_READABLE_SLUGS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"] as const;
const STATUS_REFERENCE_NAME_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const STATUS_VERIFICATION_MECHANISMS = Object.values(NODE_STATUS_VERIFICATION_MECHANISM);
const STATUS_EVIDENCE_OUTCOMES: readonly NodeStatusEvidenceOutcome[] = Object.values(NODE_STATUS_EVIDENCE_OUTCOME);
const STATUS_MECHANISM_OVERALLS: readonly NodeStatusMechanismOverall[] = Object.values(NODE_STATUS_MECHANISM_OVERALL);
const ENUMERATED_REFERENCE_NAME = "reference";
const SPEC_TREE_PATH_SEPARATOR = SPEC_TREE_GRAMMAR.PATH_SEPARATOR;

/**
 * Evidence outcomes that realize each mechanism overall, per the rollup mapping the
 * node-status spec declares: all passed is passed, any failed is failed, passed mixed
 * with not-run is partial, and all not-run is not-run.
 */
const OUTCOMES_REALIZING_OVERALL: Readonly<Record<NodeStatusMechanismOverall, readonly NodeStatusEvidenceOutcome[]>> = {
  [NODE_STATUS_MECHANISM_OVERALL.PASSED]: [NODE_STATUS_EVIDENCE_OUTCOME.PASSED],
  [NODE_STATUS_MECHANISM_OVERALL.FAILED]: [NODE_STATUS_EVIDENCE_OUTCOME.FAILED],
  [NODE_STATUS_MECHANISM_OVERALL.PARTIAL]: [NODE_STATUS_EVIDENCE_OUTCOME.PASSED, NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN],
  [NODE_STATUS_MECHANISM_OVERALL.NOT_RUN]: [NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN],
};

/**
 * The overall a mechanism takes when every one of its references carries the same
 * outcome, per the same rollup mapping: all passed is passed, all failed is failed,
 * and all not-run is not-run.
 */
const OVERALL_OF_UNIFORM_OUTCOME: Readonly<Record<NodeStatusEvidenceOutcome, NodeStatusMechanismOverall>> = {
  [NODE_STATUS_EVIDENCE_OUTCOME.PASSED]: NODE_STATUS_MECHANISM_OVERALL.PASSED,
  [NODE_STATUS_EVIDENCE_OUTCOME.FAILED]: NODE_STATUS_MECHANISM_OVERALL.FAILED,
  [NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN]: NODE_STATUS_MECHANISM_OVERALL.NOT_RUN,
};

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
  /**
   * The node-relative linked-evidence reference the fixture materializes, present
   * exactly when the node's facts declare verification references.
   */
  readonly evidenceReference: string | undefined;
};

export type ClassificationTreeFixture = {
  readonly nodes: readonly ClassificationTreeNode[];
};

export const NODE_STATUS_TEST_GENERATOR = {
  classificationTree: arbitraryClassificationTree,
  classificationTreeWithVerificationReferences: arbitraryClassificationTreeWithVerificationReferences,
  delegationTree: arbitraryDelegationTree,
  statusReference: arbitraryStatusReference,
  evidenceOutcome: arbitraryEvidenceOutcome,
  contradictingEvidenceOutcome: arbitraryContradictingEvidenceOutcome,
  verification: arbitraryVerification,
  trackedFile: arbitraryTrackedFile,
  trackedFileSet: arbitraryTrackedFileSet,
  invalidExcludeEntry: arbitraryInvalidExcludeEntry,
  orphanStatusPath: arbitraryOrphanStatusPath,
  untrackedNodeStatusPath: arbitraryUntrackedNodeStatusPath,
} as const;

/**
 * Every combination of the classification facts over their finite source-owned
 * domains: linked verification references present or absent, `spx/EXCLUDE` listing
 * present or absent, and committed verification absent, empty, or any set of
 * mechanisms each carrying any overall the status file admits.
 */
export function enumerateClassificationFacts(): readonly NodeClassificationFacts[] {
  const committedVerifications: readonly (NodeStatusVerification | undefined)[] = [
    undefined,
    ...enumerateCommittedVerifications(),
  ];
  return [false, true].flatMap((hasVerificationReferences) =>
    [false, true].flatMap((isExcluded) =>
      committedVerifications.map((verification): NodeClassificationFacts => ({
        hasVerificationReferences,
        isExcluded,
        verification,
      }))
    )
  );
}

/**
 * Every non-empty multiset of evidence outcomes in which each outcome occurs at most
 * {@link NODE_STATUS_GENERATOR_OPTIONS.MAX_OUTCOME_MULTIPLICITY} times, keyed by
 * distinct evidence references, so the rollup domain varies both which outcomes
 * occur and how often each occurs.
 */
export function enumerateEvidenceOutcomeMultisets(): readonly Readonly<Record<string, NodeStatusEvidenceOutcome>>[] {
  const counts = Array.from(
    { length: NODE_STATUS_GENERATOR_OPTIONS.MAX_OUTCOME_MULTIPLICITY + 1 },
    (_, count) => count,
  );
  const countVectors = STATUS_EVIDENCE_OUTCOMES.reduce<readonly (readonly number[])[]>(
    (vectors) => vectors.flatMap((vector) => counts.map((count) => [...vector, count])),
    [[]],
  );
  return countVectors
    .filter((vector) => vector.some((count) => count > 0))
    .map((vector) =>
      outcomesWithEnumeratedReferences(
        STATUS_EVIDENCE_OUTCOMES.flatMap((outcome, index) => Array.from({ length: vector[index] ?? 0 }, () => outcome)),
      )
    );
}

/**
 * A committed status document whose test mechanism claims `outcome` for each given
 * evidence path. The schema version is the source-owned one, and the overall follows
 * the uniform-outcome rollup rather than the production rollup the claim is checked
 * against.
 */
export function createClaimedTestStatus(
  evidencePaths: readonly string[],
  outcome: NodeStatusEvidenceOutcome,
): NodeStatusFile {
  return {
    [NODE_STATUS_FIELD.SCHEMA_VERSION]: NODE_STATUS_SCHEMA_VERSION,
    [NODE_STATUS_FIELD.VERIFICATION]: {
      [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: {
        [NODE_STATUS_FIELD.OVERALL]: OVERALL_OF_UNIFORM_OUTCOME[outcome],
        ...Object.fromEntries(evidencePaths.map((path) => [path, outcome])),
      },
    },
  };
}

function enumerateCommittedVerifications(): readonly NodeStatusVerification[] {
  return STATUS_VERIFICATION_MECHANISMS.reduce<readonly NodeStatusVerification[]>(
    (verifications, mechanism) =>
      verifications.flatMap((verification) => [
        verification,
        ...STATUS_MECHANISM_OVERALLS.map((overall): NodeStatusVerification => ({
          ...verification,
          [mechanism]: mechanismRecordRealizing(overall),
        })),
      ]),
    [{}],
  );
}

function mechanismRecordRealizing(overall: NodeStatusMechanismOverall): NodeStatusMechanismRecord {
  return {
    [NODE_STATUS_FIELD.OVERALL]: overall,
    ...outcomesWithEnumeratedReferences(OUTCOMES_REALIZING_OVERALL[overall]),
  };
}

function outcomesWithEnumeratedReferences(
  outcomes: readonly NodeStatusEvidenceOutcome[],
): Readonly<Record<string, NodeStatusEvidenceOutcome>> {
  return Object.fromEntries(
    outcomes.map((outcome, index) => [
      evidenceReferencePath(
        `${ENUMERATED_REFERENCE_NAME}${SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR}${index}`,
        SPEC_TREE_EVIDENCE_FILE.MODES[index % SPEC_TREE_EVIDENCE_FILE.MODES.length],
        SPEC_TREE_EVIDENCE_FILE.LEVELS[index % SPEC_TREE_EVIDENCE_FILE.LEVELS.length],
      ),
      outcome,
    ]),
  );
}

function evidenceReferencePath(name: string, mode: string, level: string): string {
  return [
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    [name, mode, level, ...SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT].join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR),
  ].join(SPEC_TREE_PATH_SEPARATOR);
}

function nodeDirectoryName(order: number, slug: string): string {
  return `${order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${slug}${ENABLER_SUFFIX}`;
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
      mode: fc.constantFrom(...SPEC_TREE_EVIDENCE_FILE.MODES),
      level: fc.constantFrom(...SPEC_TREE_EVIDENCE_FILE.LEVELS),
    })
    .map(({ name, mode, level }) => evidenceReferencePath(name, mode, level));
}

function arbitraryEvidenceOutcome(): fc.Arbitrary<NodeStatusEvidenceOutcome> {
  return fc.constantFrom(...STATUS_EVIDENCE_OUTCOMES);
}

function arbitraryContradictingEvidenceOutcome(
  outcome: NodeStatusEvidenceOutcome,
): fc.Arbitrary<NodeStatusEvidenceOutcome> {
  return fc.constantFrom(...STATUS_EVIDENCE_OUTCOMES.filter((candidate) => candidate !== outcome));
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
    [SPEC_TREE_CONFIG.ROOT_DIRECTORY, slug, NODE_STATUS_FILENAME].join(SPEC_TREE_PATH_SEPARATOR)
  );
}

function arbitraryUntrackedNodeStatusPath(takenNodeIds: readonly string[] = []): fc.Arbitrary<string> {
  return fc
    .record({
      order: fc.integer({ min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN, max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX }),
      slug: arbitraryNodeSlug(),
    })
    .map(({ order, slug }) => nodeDirectoryName(order, slug))
    .filter((nodeId) => !takenNodeIds.includes(nodeId))
    .map((nodeId) => [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, NODE_STATUS_FILENAME].join(SPEC_TREE_PATH_SEPARATOR));
}

function arbitraryMechanismRecord(): fc.Arbitrary<NodeStatusMechanismRecord> {
  return fc
    .uniqueArray(arbitraryStatusReference(), { minLength: 1, maxLength: 4 })
    .chain((references) =>
      fc.tuple(
        fc.constantFrom(...STATUS_MECHANISM_OVERALLS),
        fc.tuple(
          ...references.map((reference) => arbitraryEvidenceOutcome().map((outcome) => [reference, outcome] as const)),
        ),
      )
    )
    .map(([overall, entries]): NodeStatusMechanismRecord => ({
      [NODE_STATUS_FIELD.OVERALL]: overall,
      ...outcomesFromEntries(entries),
    }));
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
          }).chain((entry) =>
            arbitraryEvidenceReferenceFor(entry.facts.hasVerificationReferences).map((evidenceReference) => ({
              ...entry,
              evidenceReference,
            }))
          )
        ),
      )
    )
    .map((entries) => ({
      nodes: entries.map(({ order, slug, facts, evidenceReference }) => ({
        dirName: nodeDirectoryName(order, slug),
        slug,
        facts,
        evidenceReference,
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
    .record({
      slug: arbitraryNodeSlug(),
      runnerPassed: fc.boolean(),
      evidenceReference: arbitraryEvidenceReferenceFor(hasVerificationReferences),
    })
    .map(({ slug, runnerPassed, evidenceReference }) => ({
      dirName: nodeDirectoryName(order, slug),
      slug,
      evidenceReference,
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

/** A linked-evidence reference when the node has verification references, and none otherwise. */
function arbitraryEvidenceReferenceFor(hasVerificationReferences: boolean): fc.Arbitrary<string | undefined> {
  return hasVerificationReferences ? arbitraryStatusReference() : fc.constant(undefined);
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
