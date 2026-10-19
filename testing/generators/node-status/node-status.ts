import * as fc from "fast-check";

import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { GIT_SUCCESS_EXIT_CODE, TRACKED_PATH_DIRECTORY_SEPARATOR } from "@/lib/git/tracked-paths";
import type {
  NodeClaimClassificationFacts,
  NodeClassificationFacts,
  NodeStatusClaim,
  NodeStatusClaimShape,
  NodeStatusCurrency,
  NodeStatusEvidenceOutcome,
  NodeStatusFile,
  NodeStatusMechanismOverall,
  NodeStatusMechanismRecord,
  NodeStatusVerification,
} from "@/lib/node-status";
import {
  NODE_STATUS_CLAIM_FIELD,
  NODE_STATUS_CLAIM_SECTION,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_CURRENCY,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FIELD,
  NODE_STATUS_FILENAME,
  NODE_STATUS_MALLEABILITY,
  NODE_STATUS_MECHANISM_OVERALL,
  NODE_STATUS_SCHEMA_VERSION,
  NODE_STATUS_VERIFICATION_MECHANISM,
} from "@/lib/node-status";
import { VARIANT_DIRECTORY_SUFFIX } from "@/lib/node-status/provider";
import {
  KIND_REGISTRY,
  SPEC_TREE_CONFIG,
  SPEC_TREE_EVIDENCE_FILE,
  SPEC_TREE_GRAMMAR,
  SPEC_TREE_NODE_STATE,
} from "@/lib/spec-tree";
import { evidenceFileNameFor } from "@testing/generators/spec-tree/evidence-file-name";

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
const STATUS_REFERENCE_NAME_PATTERN = /^[a-z][a-z0-9]{1,5}(-[a-z][a-z0-9]{1,5})?$/;
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
  trackedPathProbe: arbitraryTrackedPathProbe,
  untrackedNodeStatusPath: arbitraryUntrackedNodeStatusPath,
  pinnedNode: arbitraryPinnedNode,
  nestedPinnedNode: arbitraryNestedPinnedNode,
  variantParent: arbitraryVariantParent,
  methodologyVersion: arbitraryMethodologyVersion,
  methodologyVersionWithShape: arbitraryMethodologyVersionWithShape,
  statusWriterTreeUnderMethodology: arbitraryStatusWriterTreeUnderMethodology,
  recordedRunSets: arbitraryRecordedRunSets,
  trackedPathInclusionCase: arbitraryTrackedPathInclusionCase,
  commitId: arbitraryCommitId,
  claimComparison: arbitraryClaimComparison,
  committedClaimDrift: arbitraryCommittedClaimDrift,
  pinCurrencyCheckout: arbitraryPinCurrencyCheckout,
  productName: arbitraryNodeSlug,
  recordedVerdict: arbitraryRecordedVerdict,
} as const;

/** What a recorded run reported for one result: its verdict and the subject paths it read. */
export type RecordedRun = {
  readonly verdict: NodeStatusEvidenceOutcome;
  readonly read: readonly string[];
};

function arbitraryRecordedVerdict(): fc.Arbitrary<NodeStatusEvidenceOutcome> {
  return fc.constantFrom(NODE_STATUS_EVIDENCE_OUTCOME.PASSED, NODE_STATUS_EVIDENCE_OUTCOME.FAILED);
}

/**
 * For each of `keys`, the run a recorded verification surface reported: any verdict, and the subject paths
 * it read as any subset of `subjectPaths`, so a run covers no subject, some, or all of them. With `optional`,
 * a key may also have no recorded run at all.
 */
function arbitraryRecordedRuns(
  subjectPaths: readonly string[],
  keys: readonly string[],
  optional = false,
): fc.Arbitrary<Readonly<Record<string, RecordedRun | undefined>>> {
  const run: fc.Arbitrary<RecordedRun> = fc.record({
    verdict: arbitraryEvidenceOutcome(),
    read: fc.subarray([...subjectPaths]),
  });
  return fc
    .tuple(...keys.map(() => (optional ? fc.option(run, { nil: undefined }) : run)))
    .map((runs) => Object.fromEntries(keys.map((key, index) => [key, runs[index]])));
}

/** The recorded runs of a pinned node: a run for each linked test, and for audit slugs and evidence kinds optionally. */
export type RecordedRunSets = {
  readonly tests: Readonly<Record<string, RecordedRun | undefined>>;
  readonly audit: Readonly<Record<string, RecordedRun | undefined>>;
  readonly evidence: Readonly<Record<string, RecordedRun | undefined>>;
};

/**
 * The recorded runs a verification surface may report for a pinned node: every linked test carries a run, while
 * each audit rule slug and each evidence kind may have no recorded run at all.
 */
function arbitraryRecordedRunSets(
  subjectPaths: readonly string[],
  testPaths: readonly string[],
  auditRuleSlugs: readonly string[],
  evidenceKinds: readonly string[],
): fc.Arbitrary<RecordedRunSets> {
  return fc.record({
    tests: arbitraryRecordedRuns(subjectPaths, testPaths),
    audit: arbitraryRecordedRuns(subjectPaths, auditRuleSlugs, true),
    evidence: arbitraryRecordedRuns(subjectPaths, evidenceKinds, true),
  });
}

/** A status-writer tree with an exact methodology version of the claim shape given. */
export type StatusWriterTreeUnderMethodology = {
  readonly tree: StatusWriterTreeFixture;
  readonly version: string;
};

function arbitraryStatusWriterTreeUnderMethodology(
  shape: NodeStatusClaimShape,
): fc.Arbitrary<StatusWriterTreeUnderMethodology> {
  return fc
    .tuple(arbitraryStatusWriterTree(), arbitraryMethodologyVersion(shape))
    .map(([tree, version]) => ({ tree, version }));
}

/** An exact methodology version together with the claim shape it belongs to, over every claim shape. */
export type MethodologyVersionWithShape = {
  readonly shape: NodeStatusClaimShape;
  readonly version: string;
};

function arbitraryMethodologyVersionWithShape(): fc.Arbitrary<MethodologyVersionWithShape> {
  return fc
    .constantFrom(...Object.values(NODE_STATUS_CLAIM_SHAPE))
    .chain((shape) => arbitraryMethodologyVersion(shape).map((version) => ({ shape, version })));
}

/** A tracked-file set with a probe path against it. */
export type TrackedPathInclusionCase = {
  readonly trackedFiles: ReadonlySet<string>;
  readonly probe: string;
};

function arbitraryTrackedPathInclusionCase(): fc.Arbitrary<TrackedPathInclusionCase> {
  return arbitraryTrackedFileSet().chain((trackedFiles) =>
    arbitraryTrackedPathProbe(trackedFiles).map((probe) => ({ trackedFiles, probe }))
  );
}

const COMMIT_ID_PATTERN = /^[0-9a-f]{40}$/;

function arbitraryCommitId(): fc.Arbitrary<string> {
  return fc.stringMatching(COMMIT_ID_PATTERN);
}

/**
 * A 4.0 claim whose test section holds one entry per given reference carrying the given verdict: a passed or
 * failed entry pinned to `commit` over `read`, a not-run entry unpinned.
 */
export function createClaimWithVerdicts(
  verdicts: Readonly<Record<string, NodeStatusEvidenceOutcome>>,
  commit: string,
  read: readonly string[],
): NodeStatusClaim {
  return {
    [NODE_STATUS_CLAIM_FIELD.STATE]: SPEC_TREE_NODE_STATE.SPECIFIED,
    [NODE_STATUS_CLAIM_FIELD.MALLEABILITY]: NODE_STATUS_MALLEABILITY.IMPLEMENTATION,
    [NODE_STATUS_CLAIM_FIELD.VERIFICATION]: {
      [NODE_STATUS_CLAIM_SECTION.TEST]: Object.fromEntries(
        Object.entries(verdicts).map(([reference, verdict]) => [
          reference,
          verdict === NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN
            ? { [NODE_STATUS_CLAIM_FIELD.VERDICT]: verdict }
            : {
              [NODE_STATUS_CLAIM_FIELD.VERDICT]: verdict,
              [NODE_STATUS_CLAIM_FIELD.COMMIT]: commit,
              [NODE_STATUS_CLAIM_FIELD.READ]: read,
            },
        ]),
      ),
    },
  };
}

const GENERATED_SUBJECT_DIRECTORY = "src";
const GENERATED_SUBJECT_EXTENSION = ".ts";

/**
 * A node whose results are pinned to a committed read set: the tests it links, the source
 * subjects those tests exercise, and the index of the one subject an edit changes.
 */
export type PinnedNodeFixture = {
  readonly dirName: string;
  readonly slug: string;
  /** Product-relative paths of the source subjects, at least two and distinct. */
  readonly subjectPaths: readonly string[];
  readonly editedSubject: number;
  /** The directory the node nests in, when it is not a top-level node. */
  readonly ancestor?: { readonly dirName: string; readonly slug: string };
};

/**
 * Where a decision record sits relative to a pinned node: inside the node's own directory, beside the node at the
 * product root with a lower, equal, or higher index, or inside an unrelated sibling node's directory.
 */
export const DECISION_PLACEMENT = {
  OWN_DIRECTORY: "own-directory",
  ROOT_LOWER_INDEX: "root-lower-index",
  ROOT_SAME_INDEX: "root-same-index",
  ROOT_HIGHER_INDEX: "root-higher-index",
  UNRELATED_NODE: "unrelated-node",
} as const;

/**
 * Where a decision record sits relative to a node nested in an ancestor, beside the placements of
 * `DECISION_PLACEMENT` (whose product-root indices then compare with the ancestor's index): inside the ancestor's
 * directory with an index lower than, equal to, or higher than the node's.
 */
export const ANCESTOR_DECISION_PLACEMENT = {
  ANCESTOR_LOWER_INDEX: "ancestor-lower-index",
  ANCESTOR_SAME_INDEX: "ancestor-same-index",
  ANCESTOR_HIGHER_INDEX: "ancestor-higher-index",
} as const;

export type DecisionPlacement =
  | (typeof DECISION_PLACEMENT)[keyof typeof DECISION_PLACEMENT]
  | (typeof ANCESTOR_DECISION_PLACEMENT)[keyof typeof ANCESTOR_DECISION_PLACEMENT];

/** Every placement around a top-level node, each exactly once. */
export function enumerateDecisionPlacements(): readonly DecisionPlacement[] {
  return Object.values(DECISION_PLACEMENT);
}

/** Every placement around a node nested in an ancestor, each exactly once. */
export function enumerateNestedDecisionPlacements(): readonly DecisionPlacement[] {
  return [...Object.values(DECISION_PLACEMENT), ...Object.values(ANCESTOR_DECISION_PLACEMENT)];
}

/** A parent node with variants, each variant either passing or carrying a failed result. */
export type VariantParentFixture = {
  readonly parentDirName: string;
  readonly parentSlug: string;
  readonly variants: readonly {
    readonly dirName: string;
    readonly slug: string;
    readonly passes: boolean;
  }[];
};

/**
 * The facts a committed claim set is built from for the committed-status comparison: distinct node ids, the test
 * keys and the audit rule slug each node's claim holds, two distinct pin commits, the subject paths a pin reads
 * and one further subject path outside that read set, and two distinct actors and runs.
 */
export type ClaimComparisonFixture = {
  readonly nodeIds: readonly string[];
  readonly testKeys: readonly string[];
  readonly auditSlug: string;
  /** Two distinct commits: the pin commit of the committed claims and a different one. */
  readonly commits: readonly [string, string];
  readonly readPaths: readonly string[];
  /** A subject path no committed pin reads. */
  readonly extraReadPath: string;
  /** Two distinct actor ids and two distinct runs. */
  readonly actorIds: readonly [string, string];
  readonly runs: readonly [string, string];
};

function arbitraryClaimComparison(): fc.Arbitrary<ClaimComparisonFixture> {
  const subjectPath = (name: string) =>
    `${GENERATED_SUBJECT_DIRECTORY}${SPEC_TREE_PATH_SEPARATOR}${name}${GENERATED_SUBJECT_EXTENSION}`;
  return fc
    .record({
      nodeIds: fc.uniqueArray(arbitraryNodeSlug(), {
        minLength: 2,
        maxLength: NODE_STATUS_GENERATOR_OPTIONS.MAX_NODES,
      }),
      testKeys: fc.uniqueArray(arbitraryNodeSlug(), { minLength: 2, maxLength: 3 }),
      auditSlug: arbitraryNodeSlug(),
      commits: fc.uniqueArray(arbitraryCommitId(), { minLength: 2, maxLength: 2 }),
      subjects: fc.uniqueArray(arbitraryNodeSlug(), { minLength: 3, maxLength: NODE_STATUS_READABLE_SLUGS.length }),
      actorIds: fc.uniqueArray(arbitraryNodeSlug(), { minLength: 2, maxLength: 2 }),
      runs: fc.uniqueArray(arbitraryCommitId(), { minLength: 2, maxLength: 2 }),
    })
    .map(({ nodeIds, testKeys, auditSlug, commits, subjects, actorIds, runs }): ClaimComparisonFixture => ({
      nodeIds,
      testKeys: testKeys.map((key) => `${key}${GENERATED_SUBJECT_EXTENSION}`),
      auditSlug,
      commits: [commits[0] ?? "", commits[1] ?? ""],
      readPaths: subjects.slice(0, -1).map(subjectPath),
      extraReadPath: subjectPath(subjects[subjects.length - 1] ?? ""),
      actorIds: [actorIds[0] ?? "", actorIds[1] ?? ""],
      runs: [runs[0] ?? "", runs[1] ?? ""],
    }));
}

/**
 * The differences injected into a committed claim of a pinned node: how far its recorded state shifts along the
 * lifecycle states, and one source path outside every read set the node's results record.
 */
export type CommittedClaimDriftFixture = {
  /** A shift of one to the count of lifecycle states less one, so the shifted state differs from the original. */
  readonly stateShift: number;
  readonly unreadPath: string;
};

const GENERATED_UNREAD_DIRECTORY = "unread";

function arbitraryCommittedClaimDrift(): fc.Arbitrary<CommittedClaimDriftFixture> {
  return fc.record({
    stateShift: fc.integer({ min: 1, max: Object.values(SPEC_TREE_NODE_STATE).length - 1 }),
    unreadPath: arbitraryNodeSlug().map((name) =>
      `${GENERATED_UNREAD_DIRECTORY}${SPEC_TREE_PATH_SEPARATOR}${name}${GENERATED_SUBJECT_EXTENSION}`
    ),
  });
}

/** The edits a pinned checkout can undergo after its claim was committed, by what they change under the pin. */
export const PIN_CHECKOUT_EDIT = {
  NONE: "none",
  READ_SUBJECT: "read-subject",
  SPEC: "spec",
} as const;

export type PinCheckoutEdit = (typeof PIN_CHECKOUT_EDIT)[keyof typeof PIN_CHECKOUT_EDIT];

/**
 * One coherent pin-currency checkout: a pinned node, the edit its checkout undergoes after the claim is
 * committed, and the currency the pin has afterwards. An unchanged checkout keeps the pin current; a change to
 * a path the result read, or to the spec, makes it not current.
 */
export type PinCurrencyCheckout = {
  readonly node: PinnedNodeFixture;
  readonly edit: PinCheckoutEdit;
  readonly currency: NodeStatusCurrency;
};

const PIN_CHECKOUT_EDIT_CURRENCY: Readonly<Record<PinCheckoutEdit, NodeStatusCurrency>> = {
  [PIN_CHECKOUT_EDIT.NONE]: NODE_STATUS_CURRENCY.CURRENT,
  [PIN_CHECKOUT_EDIT.READ_SUBJECT]: NODE_STATUS_CURRENCY.NOT_CURRENT,
  [PIN_CHECKOUT_EDIT.SPEC]: NODE_STATUS_CURRENCY.NOT_CURRENT,
};

/** A checkout state drawn from the edit domain, or from the given edit alone. */
function arbitraryPinCurrencyCheckout(edit?: PinCheckoutEdit): fc.Arbitrary<PinCurrencyCheckout> {
  return fc
    .tuple(
      arbitraryPinnedNode(),
      edit === undefined ? fc.constantFrom(...Object.values(PIN_CHECKOUT_EDIT)) : fc.constant(edit),
    )
    .map(([node, drawn]): PinCurrencyCheckout => ({
      node,
      edit: drawn,
      currency: PIN_CHECKOUT_EDIT_CURRENCY[drawn],
    }));
}

function arbitraryPinnedNode(): fc.Arbitrary<PinnedNodeFixture> {
  return fc
    .record({
      order: fc.integer({ min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN, max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX }),
      slug: arbitraryNodeSlug(),
      subjects: fc.uniqueArray(arbitraryNodeSlug(), { minLength: 2, maxLength: NODE_STATUS_READABLE_SLUGS.length }),
    })
    .chain(({ order, slug, subjects }) =>
      fc.integer({ min: 0, max: subjects.length - 1 }).map((editedSubject): PinnedNodeFixture => ({
        dirName: nodeDirectoryName(order, slug),
        slug,
        subjectPaths: subjects.map((subject) =>
          `${GENERATED_SUBJECT_DIRECTORY}${SPEC_TREE_PATH_SEPARATOR}${subject}${GENERATED_SUBJECT_EXTENSION}`
        ),
        editedSubject,
      }))
    );
}

function arbitraryNestedPinnedNode(): fc.Arbitrary<PinnedNodeFixture> {
  return fc
    .tuple(
      arbitraryPinnedNode(),
      fc.record({
        order: fc.integer({
          min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN,
          max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX,
        }),
        slug: arbitraryNodeSlug(),
      }),
    )
    .map(([node, ancestor]): PinnedNodeFixture => ({
      ...node,
      ancestor: { dirName: nodeDirectoryName(ancestor.order, ancestor.slug), slug: ancestor.slug },
    }));
}

/**
 * How the variants of a parent divide between passing and failing: every variant passes, some pass while others
 * fail, or every variant fails. The mixed partition is the one that separates "every variant passes" from "some
 * variant passes".
 */
export const VARIANT_PARTITION = {
  ALL_PASS: "all-pass",
  SOME_FAIL: "some-fail",
  ALL_FAIL: "all-fail",
} as const;

export type VariantPartition = (typeof VARIANT_PARTITION)[keyof typeof VARIANT_PARTITION];

/**
 * A parent with at least two variants whose passing and failing variants divide as `partition` states, with the
 * passing variants at any positions among them; the mixed partition always holds at least one passing and at
 * least one failing variant.
 */
function arbitraryVariantParent(partition: VariantPartition): fc.Arbitrary<VariantParentFixture> {
  return fc
    .record({
      order: fc.integer({ min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN, max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX }),
      slug: arbitraryNodeSlug(),
      variants: fc.uniqueArray(
        fc.record({
          order: fc.integer({
            min: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MIN,
            max: NODE_STATUS_GENERATOR_OPTIONS.ORDER_MAX,
          }),
          slug: arbitraryNodeSlug(),
        }),
        {
          minLength: 2,
          maxLength: NODE_STATUS_GENERATOR_OPTIONS.MAX_NODES,
          selector: (variant) => `${variant.order}${variant.slug}`,
        },
      ),
    })
    .chain(({ order, slug, variants }) =>
      arbitraryPassingIndices(variants.length, partition).map((passing): VariantParentFixture => ({
        parentDirName: nodeDirectoryName(order, slug),
        parentSlug: slug,
        variants: variants.map((variant, index) => ({
          dirName: `${variant.order}${SPEC_TREE_GRAMMAR.ORDER.SEPARATOR}${variant.slug}${VARIANT_DIRECTORY_SUFFIX}`,
          slug: variant.slug,
          passes: passing.includes(index),
        })),
      }))
    );
}

function arbitraryPassingIndices(variantCount: number, partition: VariantPartition): fc.Arbitrary<readonly number[]> {
  const indices = Array.from({ length: variantCount }, (_, index) => index);
  switch (partition) {
    case VARIANT_PARTITION.ALL_PASS:
      return fc.constant(indices);
    case VARIANT_PARTITION.ALL_FAIL:
      return fc.constant([]);
    case VARIANT_PARTITION.SOME_FAIL:
      return fc.shuffledSubarray(indices, { minLength: 1, maxLength: variantCount - 1 });
  }
}

const METHODOLOGY_CURRENT_MAJOR_MIN = 4;
const METHODOLOGY_CURRENT_MAJOR_MAX = 9;
const METHODOLOGY_PRIOR_MAJOR_MAX = 3;
const METHODOLOGY_VERSION_COMPONENT_MAX = 9;

/** An exact methodology version of the claim shape given, in the `MAJOR.MINOR` or `MAJOR.MINOR.PATCH` form. */
function arbitraryMethodologyVersion(shape: NodeStatusClaimShape): fc.Arbitrary<string> {
  const major = shape === NODE_STATUS_CLAIM_SHAPE.CURRENT
    ? fc.integer({ min: METHODOLOGY_CURRENT_MAJOR_MIN, max: METHODOLOGY_CURRENT_MAJOR_MAX })
    : fc.integer({ min: 0, max: METHODOLOGY_PRIOR_MAJOR_MAX });
  const component = fc.integer({ min: 0, max: METHODOLOGY_VERSION_COMPONENT_MAX });
  return fc
    .record({ major, minor: component, patch: fc.option(component, { nil: undefined }) })
    .map(({ major, minor, patch }) => [major, minor, ...(patch === undefined ? [] : [patch])].join("."));
}

/**
 * Every combination of the 4.0 classification facts over their finite domains: required artifacts present
 * or missing, the declaration changed after a recorded `passing` or not, and result sets of zero, one, or
 * two results, each result any verdict at any currency.
 */
export function enumerateClaimClassificationFacts(): readonly NodeClaimClassificationFacts[] {
  const currencies: readonly NodeStatusCurrency[] = Object.values(NODE_STATUS_CURRENCY);
  const singleResults = STATUS_EVIDENCE_OUTCOMES.flatMap((verdict) =>
    currencies.map((currency) => ({ verdict, currency }))
  );
  const resultSets = [
    [],
    ...singleResults.map((result) => [result]),
    ...singleResults.flatMap((first) => singleResults.map((second) => [first, second])),
  ];
  return [false, true].flatMap((requiredArtifactsMissing) =>
    [false, true].flatMap((recordedPassingAtOrAfterDeclaration) =>
      resultSets.map((results): NodeClaimClassificationFacts => ({
        requiredArtifactsMissing,
        recordedPassingAtOrAfterDeclaration,
        results,
      }))
    )
  );
}

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
        `${ENUMERATED_REFERENCE_NAME}${index}`,
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
    evidenceFileNameFor([name, mode, level], SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT),
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

/**
 * A probe path for the tracked-path predicate against `trackedFiles`: an arbitrary tracked-shaped path, or a
 * path cut inside a segment of one tracked file, so its last segment is a proper string prefix of a tracked
 * segment at the same depth and only the directory-separator boundary separates it from an ancestor directory.
 */
function arbitraryTrackedPathProbe(trackedFiles: ReadonlySet<string>): fc.Arbitrary<string> {
  const segmentPrefixProbes = [...trackedFiles].flatMap((file) => {
    const segments = file.split(TRACKED_PATH_DIRECTORY_SEPARATOR);
    return segments.flatMap((segment, depth) =>
      Array.from(
        { length: segment.length - 1 },
        (_, index) => [...segments.slice(0, depth), segment.slice(0, index + 1)].join(TRACKED_PATH_DIRECTORY_SEPARATOR),
      )
    );
  });
  return segmentPrefixProbes.length === 0
    ? arbitraryTrackedFile()
    : fc.oneof(arbitraryTrackedFile(), fc.constantFrom(...segmentPrefixProbes));
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
