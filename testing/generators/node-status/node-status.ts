import * as fc from "fast-check";

import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { GIT_SUCCESS_EXIT_CODE, TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import type {
  NodeClassificationFacts,
  NodeStatusEvidenceOutcome,
  NodeStatusFile,
  NodeStatusMechanismOverall,
  NodeStatusMechanismRecord,
  NodeStatusVerification,
} from "@/lib/node-status";
import {
  NODE_STATUS_EVIDENCE_OUTCOME,
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
  /** Most linked evidence references a status-writer-tree node carries. */
  MAX_LINKED_REFERENCES: 4,
  /** Highest count of any one outcome in an enumerated rollup multiset. */
  MAX_OUTCOME_MULTIPLICITY: 3,
  /** Most directories above a staged file. */
  MAX_STAGED_DEPTH: 3,
  /** Most files one staged repository holds. */
  MAX_STAGED_FILES: 6,
} as const;

/**
 * Characters git C-quotes in path output unless the listing is NUL-terminated:
 * tab, newline, double quote, and backslash (git-config `core.quotePath`).
 */
const GIT_QUOTED_PATH_CHARACTERS = ["\t", "\n", "\"", "\\"] as const;

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
  /** The mechanism overall a record of references that all carry the expected evidence outcome takes. */
  readonly expectedMechanismOverall: NodeStatusMechanismOverall;
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

/**
 * One linked evidence reference of a status-writer-tree node: the node-relative
 * reference path, the outcome the injected resolver reports for it — absent when a
 * recorded run covers the reference but its evidence is stale, so the resolver omits
 * it — and the outcome the node's committed status file claims for it, absent when
 * the committed file carries no claim for the reference.
 */
export type StatusWriterReference = {
  readonly reference: string;
  readonly resolverOutcome: NodeStatusEvidenceOutcome | undefined;
  readonly committedOutcome: NodeStatusEvidenceOutcome | undefined;
};

/** A committed claim for a reference the node no longer links. */
export type StatusWriterUnlinkedClaim = {
  readonly reference: string;
  readonly outcome: NodeStatusEvidenceOutcome;
};

export type StatusWriterTreeNode = {
  readonly dirName: string;
  readonly slug: string;
  readonly isExcluded: boolean;
  /** The node's linked evidence; empty for a declared node. */
  readonly references: readonly StatusWriterReference[];
  readonly unlinkedClaim: StatusWriterUnlinkedClaim | undefined;
};

export type StatusWriterTreeFixture = {
  readonly nodes: readonly StatusWriterTreeNode[];
};

/**
 * One `git ls-files` run from `productDir` that exits with a code other than success
 * while printing `stdout`.
 */
export type NonSuccessGitExitCase = {
  readonly productDir: string;
  readonly exitCode: number;
  readonly stdout: string;
};

/** One `git ls-files` invocation from `productDir` whose runner rejects with `cause`. */
export type GitRunnerFailureCase = {
  readonly productDir: string;
  readonly cause: Error;
};

export const NODE_STATUS_TEST_GENERATOR = {
  classificationTree: arbitraryClassificationTree,
  classificationTreeWithVerificationReferences: arbitraryClassificationTreeWithVerificationReferences,
  delegationTree: arbitraryDelegationTree,
  statusReference: arbitraryStatusReference,
  evidenceOutcome: arbitraryEvidenceOutcome,
  contradictingEvidenceOutcome: arbitraryContradictingEvidenceOutcome,
  statusWriterTree: arbitraryStatusWriterTree,
  stagedTrackedFiles: arbitraryStagedTrackedFiles,
  nonSuccessGitExit: arbitraryNonSuccessGitExit,
  gitRunnerFailure: arbitraryGitRunnerFailure,
  trackedFile: arbitraryTrackedFile,
  trackedFileSet: arbitraryTrackedFileSet,
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
    .map(({ hasVerificationReferences, isExcluded, runnerPassed }) =>
      classificationFixtureFacts(hasVerificationReferences, isExcluded, runnerPassed)
    );
}

/**
 * The one construction law for a classification fixture's runner and expected
 * outcomes: a passing runner exits with the testing domain's success code and any
 * other runner with the failure code; an excluded node's evidence reads not-run
 * because no run is consulted for it, while any other node's evidence reads the
 * runner's verdict; and the expected mechanism overall is the uniform-outcome
 * rollup of that single evidence outcome.
 */
function classificationFixtureFacts(
  hasVerificationReferences: boolean,
  isExcluded: boolean,
  runnerPassed: boolean,
): ClassificationFixtureFacts {
  const expectedEvidenceOutcome = isExcluded
    ? NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN
    : runnerPassed
    ? NODE_STATUS_EVIDENCE_OUTCOME.PASSED
    : NODE_STATUS_EVIDENCE_OUTCOME.FAILED;
  return {
    hasVerificationReferences,
    isExcluded,
    runnerExitCode: runnerPassed ? SUCCESS_EXIT_CODE : NODE_STATUS_GENERATOR_OPTIONS.FAILURE_EXIT_CODE,
    expectedEvidenceOutcome,
    expectedMechanismOverall: OVERALL_OF_UNIFORM_OUTCOME[expectedEvidenceOutcome],
  };
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
      facts: classificationFixtureFacts(hasVerificationReferences, isExcluded, runnerPassed),
    }));
}

/** A linked-evidence reference when the node has verification references, and none otherwise. */
function arbitraryEvidenceReferenceFor(hasVerificationReferences: boolean): fc.Arbitrary<string | undefined> {
  return hasVerificationReferences ? arbitraryStatusReference() : fc.constant(undefined);
}

/**
 * Spec trees of nodes spanning every structural and fold branch of the status writer:
 * declared nodes with no linked evidence, nodes listed in `spx/EXCLUDE`, and
 * test-outcome-stage nodes whose linked references the resolver reports as passed,
 * failed, or not-run (no recorded run covers them) or omits (covered but stale), each
 * with or without a committed claim, plus an optional committed claim for a reference
 * the node no longer links.
 */
function arbitraryStatusWriterTree(): fc.Arbitrary<StatusWriterTreeFixture> {
  return fc
    .uniqueArray(
      fc.integer({ min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN, max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX }),
      { minLength: NODE_STATUS_GENERATOR_OPTIONS.MIN_NODES, maxLength: NODE_STATUS_GENERATOR_OPTIONS.MAX_NODES },
    )
    .chain((orders) => fc.tuple(...orders.map(arbitraryStatusWriterTreeNode)))
    .map((nodes) => ({ nodes }));
}

function arbitraryStatusWriterTreeNode(order: number): fc.Arbitrary<StatusWriterTreeNode> {
  return fc
    .record({
      slug: arbitraryNodeSlug(),
      isExcluded: fc.boolean(),
      references: fc.uniqueArray(arbitraryStatusReference(), {
        minLength: 0,
        maxLength: NODE_STATUS_GENERATOR_OPTIONS.MAX_LINKED_REFERENCES + 1,
      }),
      claimsUnlinkedReference: fc.boolean(),
    })
    .chain(({ slug, isExcluded, references, claimsUnlinkedReference }) => {
      const unlinkedReference = claimsUnlinkedReference ? references.at(-1) : undefined;
      const linkedReferences = unlinkedReference === undefined ? references : references.slice(0, -1);
      return fc.record({
        dirName: fc.constant(nodeDirectoryName(order, slug)),
        slug: fc.constant(slug),
        isExcluded: fc.constant(isExcluded),
        references: fc.tuple(...linkedReferences.map(arbitraryStatusWriterReference)),
        unlinkedClaim: unlinkedReference === undefined
          ? fc.constant(undefined)
          : arbitraryEvidenceOutcome().map((outcome) => ({ reference: unlinkedReference, outcome })),
      });
    });
}

function arbitraryStatusWriterReference(reference: string): fc.Arbitrary<StatusWriterReference> {
  return fc.record({
    reference: fc.constant(reference),
    resolverOutcome: fc.option(arbitraryEvidenceOutcome(), { nil: undefined }),
    committedOutcome: fc.option(arbitraryEvidenceOutcome(), { nil: undefined }),
  });
}

/**
 * A set of files to stage in a real repository: each file sits under zero or more
 * slug directories and ends in a leaf that carries the spec-file suffix, so no file
 * path is also a directory path of another. A leaf may join two slugs with a
 * character git C-quotes in its default, non-NUL-terminated path output, so the
 * listing format the query selects decides whether the path reads back verbatim.
 */
function arbitraryStagedTrackedFiles(): fc.Arbitrary<ReadonlySet<string>> {
  return fc
    .array(
      fc.record({
        directories: fc.array(arbitraryNodeSlug(), { maxLength: NODE_STATUS_GENERATOR_OPTIONS.MAX_STAGED_DEPTH }),
        leaf: fc.oneof(
          arbitraryNodeSlug(),
          fc
            .tuple(arbitraryNodeSlug(), fc.constantFrom(...GIT_QUOTED_PATH_CHARACTERS), arbitraryNodeSlug())
            .map((parts) => parts.join("")),
        ),
      }),
      { maxLength: NODE_STATUS_GENERATOR_OPTIONS.MAX_STAGED_FILES },
    )
    .map((files) =>
      new Set(
        files.map(({ directories, leaf }) =>
          [...directories, `${leaf}${SPEC_TREE_GRAMMAR.SPEC_FILE.PRIOR_SUFFIX}`].join(TRACKED_PATH_DIRECTORY_SEPARATOR)
        ),
      )
    );
}

/**
 * Every exit code other than git's success code, drawn from both sides of it rather
 * than filtered through the comparison the tracked-path query applies.
 */
function arbitraryNonSuccessGitExit(): fc.Arbitrary<NonSuccessGitExitCase> {
  return fc.record({
    productDir: arbitraryTrackedFile(),
    exitCode: fc.oneof(
      fc.integer({ min: GIT_SUCCESS_EXIT_CODE + 1 }),
      fc.integer({ max: GIT_SUCCESS_EXIT_CODE - 1 }),
    ),
    stdout: fc.string(),
  });
}

function arbitraryGitRunnerFailure(): fc.Arbitrary<GitRunnerFailureCase> {
  return fc.record({
    productDir: arbitraryTrackedFile(),
    cause: fc.string().map((message) => new Error(message)),
  });
}
