import * as fc from "fast-check";
import { posix, win32 } from "node:path";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  VERIFICATION_CONTEXT_FILE_SUBJECT_PATH,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
  type VerificationContextSubject,
} from "@/domains/verification-context/context";
import { MERGE_PERIOD_BACKEND, type RunSetRunEvidence, type RunSetSelector } from "@/domains/verify/run-set";
import {
  AUDIT_CLASS,
  AUDIT_COVERAGE_REQUIREMENT,
  AUDIT_COVERAGE_STATUS,
  AUDIT_FINDING_SEVERITY,
  AUDIT_KIND,
  type AuditFinding,
  type AuditProducerIdentity,
  type AuditProducerProvenance,
  type AuditScopeUnit,
  REVIEW_ANCHOR_SIDE,
  REVIEW_FINDING_DISPOSITION,
  REVIEW_PAYLOAD_FIELD,
  REVIEW_SCOPE_COVERAGE_STATE,
  REVIEW_TERMINAL_STATE,
  REVIEW_TERMINAL_STATUSES,
  type ReviewFinding,
  type ReviewScopeUnit,
  type ReviewTerminalMetadata,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { VERIFICATION_RUN_CLI_SURFACE, VERIFY_CLI } from "@/interfaces/cli/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { GIT_MODIFY_STATUS_EXAMPLE, GIT_NULL_RECORD_SEPARATOR } from "@/lib/git/name-status";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

const VERIFY_VERIFICATION_TYPES: readonly string[] = Object.values(VERIFY_VERIFICATION_TYPE);
const VERIFY_SCOPE_TYPES = Object.values(VERIFY_SCOPE_TYPE);
const REVIEW_RUN_SET_RUN_INTERVAL_MS = 60_000;
const REVIEW_FINDING_DISPOSITIONS = Object.values(REVIEW_FINDING_DISPOSITION);
const REVIEW_ANCHOR_SIDES = Object.values(REVIEW_ANCHOR_SIDE);
const REVIEW_SCOPE_COVERAGE_STATES = Object.values(REVIEW_SCOPE_COVERAGE_STATE);
const AUDIT_COVERAGE_REQUIREMENTS = Object.values(AUDIT_COVERAGE_REQUIREMENT);
const AUDIT_COVERAGE_STATUSES = Object.values(AUDIT_COVERAGE_STATUS);
const AUDIT_UNCOVERED_COVERAGE_STATUSES = AUDIT_COVERAGE_STATUSES.filter((status) =>
  status !== AUDIT_COVERAGE_STATUS.AUDITED && status !== AUDIT_COVERAGE_STATUS.NOT_APPLICABLE
);
const AUDIT_FINDING_SEVERITIES = Object.values(AUDIT_FINDING_SEVERITY);
const TERMINAL_STATUSES: readonly string[] = Object.values(JOURNAL_RUN_STATE_STATUS);
const EMPTY_SUMMARY = "";
const EMPTY_REVIEW_BODY = "";

/** A string outside the valid review-finding disposition set — an invalid `disposition` value. */
function arbitraryNonDisposition(): fc.Arbitrary<string> {
  return fc.string().filter((value) => !(REVIEW_FINDING_DISPOSITIONS as readonly string[]).includes(value));
}

function arbitraryReviewFindingMetadata(): fc.Arbitrary<ReviewFinding["finding"]> {
  return fc.record({
    disposition: fc.constantFrom(...REVIEW_FINDING_DISPOSITIONS),
    summary: STATE_STORE_TEST_GENERATOR.scopeToken(),
  });
}

/** A valid review finding: an anchored review comment with SPX finding metadata. */
function arbitraryReviewFinding(): fc.Arbitrary<ReviewFinding> {
  const base = {
    path: arbitrarySourceFilePath(),
    side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
    originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
    diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
    body: STATE_STORE_TEST_GENERATOR.scopeToken(),
    finding: arbitraryReviewFindingMetadata(),
  };
  return fc.oneof(
    fc.record({
      ...base,
      line: fc.integer({ min: 1 }),
    }),
    fc.record({
      ...base,
      position: fc.integer({ min: 1 }),
      providerIdentity: STATE_STORE_TEST_GENERATOR.scopeToken(),
      url: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
    fc.record({
      ...base,
      line: fc.integer({ min: 1 }),
      position: fc.integer({ min: 1 }),
      providerIdentity: STATE_STORE_TEST_GENERATOR.scopeToken(),
      url: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
  );
}

function arbitraryLineReviewFinding(): fc.Arbitrary<ReviewFinding> {
  return arbitraryReviewFinding().filter((finding) =>
    finding.line !== undefined && finding.position === undefined && finding.providerIdentity === undefined
  );
}

function arbitraryProviderPositionReviewFinding(): fc.Arbitrary<ReviewFinding> {
  return arbitraryReviewFinding().filter((finding) =>
    finding.line === undefined && finding.position !== undefined && finding.providerIdentity !== undefined
  );
}

function arbitraryProviderLineAndPositionReviewFinding(): fc.Arbitrary<ReviewFinding> {
  return arbitraryReviewFinding().filter((finding) =>
    finding.line !== undefined && finding.position !== undefined && finding.providerIdentity !== undefined
  );
}

function arbitraryReviewScopeUnit(): fc.Arbitrary<ReviewScopeUnit> {
  const base = {
    path: arbitrarySourceFilePath(),
    side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
    commit: STATE_STORE_TEST_GENERATOR.headSha(),
    coverageState: fc.constantFrom(...REVIEW_SCOPE_COVERAGE_STATES),
  };
  return fc.oneof(
    fc.record({
      ...base,
      line: fc.integer({ min: 1 }),
    }),
    fc.record({
      ...base,
      position: fc.integer({ min: 1 }),
      providerIdentity: STATE_STORE_TEST_GENERATOR.scopeToken(),
      url: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
    fc.record(base),
  );
}

function arbitraryReviewTerminalMetadata(state: string): fc.Arbitrary<ReviewTerminalMetadata> {
  return fc.record({
    actor: STATE_STORE_TEST_GENERATOR.scopeToken(),
    state: fc.constant(state),
    body: fc.oneof(STATE_STORE_TEST_GENERATOR.scopeToken(), fc.constant(EMPTY_REVIEW_BODY)),
    submittedAt: VERIFY_TEST_GENERATOR.launchedAt().map((date) => date.toISOString()),
    commit: STATE_STORE_TEST_GENERATOR.headSha(),
  }) as fc.Arbitrary<ReviewTerminalMetadata>;
}

function arbitraryReviewTerminalMetadataWithProvider(state: string): fc.Arbitrary<ReviewTerminalMetadata> {
  return fc.record({
    actor: STATE_STORE_TEST_GENERATOR.scopeToken(),
    state: fc.constant(state),
    body: fc.oneof(STATE_STORE_TEST_GENERATOR.scopeToken(), fc.constant(EMPTY_REVIEW_BODY)),
    submittedAt: VERIFY_TEST_GENERATOR.launchedAt().map((date) => date.toISOString()),
    commit: STATE_STORE_TEST_GENERATOR.headSha(),
    providerIdentity: STATE_STORE_TEST_GENERATOR.scopeToken(),
    url: STATE_STORE_TEST_GENERATOR.scopeToken(),
  }) as fc.Arbitrary<ReviewTerminalMetadata>;
}

/** One review finding beside a display variant sharing its anchor side, path, and SPX summary. */
function arbitraryReviewFindingDisplayVariantPair(): fc.Arbitrary<{
  readonly base: ReviewFinding;
  readonly variant: ReviewFinding;
}> {
  return fc.tuple(arbitraryReviewFinding(), arbitraryReviewFinding()).map(([base, shell]) => ({
    base,
    variant: {
      ...shell,
      side: base.side,
      path: base.path,
      finding: { ...shell.finding, summary: base.finding.summary },
    },
  }));
}

/** Two review findings differing in anchor side, path, or SPX summary. */
function arbitraryReviewFindingIdentityDivergentPair(): fc.Arbitrary<{
  readonly base: ReviewFinding;
  readonly divergent: ReviewFinding;
}> {
  return fc
    .tuple(arbitraryReviewFinding(), arbitraryReviewFinding())
    .filter(([base, divergent]) =>
      base.side !== divergent.side
      || base.path !== divergent.path
      || base.finding.summary !== divergent.finding.summary
    )
    .map(([base, divergent]) => ({ base, divergent }));
}

/** One reviewed unit beside a display variant sharing its anchor side and path. */
function arbitraryReviewScopeUnitDisplayVariantPair(): fc.Arbitrary<{
  readonly base: ReviewScopeUnit;
  readonly variant: ReviewScopeUnit;
}> {
  return fc.tuple(arbitraryReviewScopeUnit(), arbitraryReviewScopeUnit()).map(([base, shell]) => ({
    base,
    variant: { ...shell, side: base.side, path: base.path },
  }));
}

/** Two reviewed units differing in anchor side or path. */
function arbitraryReviewScopeUnitKeyDivergentPair(): fc.Arbitrary<{
  readonly base: ReviewScopeUnit;
  readonly divergent: ReviewScopeUnit;
}> {
  return fc
    .tuple(arbitraryReviewScopeUnit(), arbitraryReviewScopeUnit())
    .filter(([base, divergent]) => base.side !== divergent.side || base.path !== divergent.path)
    .map(([base, divergent]) => ({ base, divergent }));
}

/** A review run set with prior and current runs plus the construction-derived expected groups. */
export interface ReviewRunSetScenario {
  readonly runs: readonly RunSetRunEvidence<JsonValue, JsonValue>[];
  readonly selector: RunSetSelector;
  readonly expectedActive: readonly JsonValue[];
  readonly expectedResolved: readonly JsonValue[];
  readonly expectedReopened: readonly JsonValue[];
  readonly expectedCoverageGaps: readonly JsonValue[];
}

function reviewRunSetRun(args: {
  readonly selector: RunSetSelector;
  readonly runToken: string;
  readonly scopeIdentity: string;
  readonly recordedAt: string;
  readonly scopeUnits: readonly ReviewScopeUnit[];
  readonly findings: readonly ReviewFinding[];
}): RunSetRunEvidence<JsonValue, JsonValue> {
  return {
    mergePeriod: args.selector.mergePeriod,
    verificationType: args.selector.verificationType,
    scopeType: args.selector.scopeType,
    runSetScopeKey: args.selector.runSetScopeKey,
    runToken: args.runToken,
    scopeIdentity: args.scopeIdentity,
    recordedAt: args.recordedAt,
    scopeUnits: args.scopeUnits as unknown as readonly JsonValue[],
    findings: args.findings as unknown as readonly JsonValue[],
  };
}

/**
 * One coherent review run set: two prior runs and a current run whose findings cover every
 * placement class — fresh, carried from the latest prior run, resolved before the current run,
 * and reopened after skipping the latest prior run — plus a reviewed unit prior runs cover that
 * the current run does not. Expected groups derive from that construction, independent of the
 * projection under test.
 */
function arbitraryReviewRunSetScenario(): fc.Arbitrary<ReviewRunSetScenario> {
  return fc
    .record({
      identities: fc.tuple(
        arbitraryReviewFinding(),
        arbitraryReviewFinding(),
        arbitraryReviewFinding(),
        arbitraryReviewFinding(),
      ),
      shells: fc.tuple(arbitraryReviewFinding(), arbitraryReviewFinding()),
      units: fc.tuple(arbitraryReviewScopeUnit(), arbitraryReviewScopeUnit()),
      branch: STATE_STORE_TEST_GENERATOR.scopeToken(),
      runSetScopeKey: STATE_STORE_TEST_GENERATOR.scopeToken(),
      runToken: STATE_STORE_TEST_GENERATOR.scopeToken(),
      scopeIdentities: fc.tuple(
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
        STATE_STORE_TEST_GENERATOR.scopeToken(),
      ),
      scopeType: fc.constantFrom(...VERIFY_SCOPE_TYPES),
      launchedAt: VERIFY_TEST_GENERATOR.launchedAt(),
    })
    .map(({ identities, shells, units, branch, runSetScopeKey, runToken, scopeIdentities, scopeType, launchedAt }) => {
      const distinct = (finding: ReviewFinding, index: number): ReviewFinding => ({
        ...finding,
        finding: { ...finding.finding, summary: `${finding.finding.summary}-f${index}` },
      });
      const variantOf = (identity: ReviewFinding, shell: ReviewFinding): ReviewFinding => ({
        ...shell,
        side: identity.side,
        path: identity.path,
        finding: { ...shell.finding, summary: identity.finding.summary },
      });
      const [active0, carried0, resolved0, reopened0] = identities;
      const findingActive = distinct(active0, 0);
      const findingCarriedPrior = distinct(carried0, 1);
      const findingResolved = distinct(resolved0, 2);
      const findingReopenedPrior = distinct(reopened0, 3);
      const [carriedShell, reopenedShell] = shells;
      const findingCarriedCurrent = variantOf(findingCarriedPrior, carriedShell);
      const findingReopenedCurrent = variantOf(findingReopenedPrior, reopenedShell);
      const [shared0, gap0] = units;
      const unitShared = { ...shared0, path: `${shared0.path}-shared` };
      const unitGap = { ...gap0, path: `${gap0.path}-gap` };
      const selector: RunSetSelector = {
        mergePeriod: { backend: MERGE_PERIOD_BACKEND.LOCAL, branch },
        verificationType: VERIFY_VERIFICATION_TYPE.REVIEW,
        scopeType,
        runSetScopeKey,
      };
      const recordedAt = (index: number): string =>
        new Date(launchedAt.getTime() + index * REVIEW_RUN_SET_RUN_INTERVAL_MS).toISOString();
      const [scopeIdentityA, scopeIdentityB, scopeIdentityC] = scopeIdentities;
      return {
        runs: [
          reviewRunSetRun({
            selector,
            runToken: `${runToken}-r0`,
            scopeIdentity: scopeIdentityA,
            recordedAt: recordedAt(0),
            scopeUnits: [unitShared, unitGap],
            findings: [findingResolved, findingReopenedPrior],
          }),
          reviewRunSetRun({
            selector,
            runToken: `${runToken}-r1`,
            scopeIdentity: scopeIdentityB,
            recordedAt: recordedAt(1),
            scopeUnits: [unitShared, unitGap],
            findings: [findingCarriedPrior, findingResolved],
          }),
          reviewRunSetRun({
            selector,
            runToken: `${runToken}-r2`,
            scopeIdentity: scopeIdentityC,
            recordedAt: recordedAt(2),
            scopeUnits: [unitShared],
            findings: [findingActive, findingCarriedCurrent, findingReopenedCurrent],
          }),
        ],
        selector,
        expectedActive: [findingActive, findingCarriedCurrent] as unknown as readonly JsonValue[],
        expectedResolved: [findingResolved] as unknown as readonly JsonValue[],
        expectedReopened: [findingReopenedCurrent] as unknown as readonly JsonValue[],
        expectedCoverageGaps: [unitGap],
      };
    });
}

function arbitraryAuditProducerIdentity(): fc.Arbitrary<AuditProducerIdentity> {
  return fc.record({
    producerKind: STATE_STORE_TEST_GENERATOR.scopeToken(),
    agentName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    agentOwningPluginName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    skillName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    skillOwningPluginName: STATE_STORE_TEST_GENERATOR.scopeToken(),
    invocationRole: STATE_STORE_TEST_GENERATOR.scopeToken(),
  });
}

function arbitraryAuditProducerProvenance(): fc.Arbitrary<AuditProducerProvenance> {
  return fc.oneof(
    fc.record({
      agentOwningPluginVersion: STATE_STORE_TEST_GENERATOR.scopeToken(),
      skillOwningPluginVersion: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
    fc.record({
      agentOwningPluginVersion: STATE_STORE_TEST_GENERATOR.scopeToken(),
      skillOwningPluginVersion: STATE_STORE_TEST_GENERATOR.scopeToken(),
      toolVersion: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
  );
}

interface AuditClassKind {
  readonly auditClass: AuditScopeUnit["auditClass"];
  readonly auditKind: AuditScopeUnit["auditKind"];
}

function arbitraryExecutedAuditClassKind(): fc.Arbitrary<AuditClassKind> {
  return fc.oneof(
    fc.record({
      auditClass: fc.constant(AUDIT_CLASS.INSTRUCTIONS),
      auditKind: fc.constantFrom(
        AUDIT_KIND.SKILL,
        AUDIT_KIND.SUBAGENT,
        AUDIT_KIND.PROMPT,
        AUDIT_KIND.GUIDE_TEMPLATE,
      ),
    }),
    fc.record({
      auditClass: fc.constant(AUDIT_CLASS.SPEC),
      auditKind: fc.constantFrom(AUDIT_KIND.SPEC, AUDIT_KIND.ADR, AUDIT_KIND.PDR),
    }),
    fc.record({
      auditClass: fc.constant(AUDIT_CLASS.IMPLEMENTATION),
      auditKind: fc.constantFrom(
        AUDIT_KIND.CODE,
        AUDIT_KIND.TESTS,
        AUDIT_KIND.ARCHITECTURE,
        AUDIT_KIND.EVAL_EVIDENCE,
      ),
    }),
  );
}

function arbitraryCoverageGapAuditClassKind(): fc.Arbitrary<AuditClassKind> {
  return fc.record({
    auditClass: fc.constantFrom(...Object.values(AUDIT_CLASS)),
    auditKind: fc.constant(AUDIT_KIND.COVERAGE_GAP),
  });
}

function arbitraryAuditScopeUnit(): fc.Arbitrary<AuditScopeUnit> {
  return arbitraryExecutedAuditClassKind().chain((kind) =>
    STATE_STORE_TEST_GENERATOR.scopeToken().chain((unitId) =>
      fc.record({
        unitId: fc.constant(unitId),
        parentUnitId: STATE_STORE_TEST_GENERATOR.scopeToken().filter((parentUnitId) => parentUnitId !== unitId),
        subject: arbitrarySourceFilePath(),
        coverageRequirement: fc.constantFrom(...AUDIT_COVERAGE_REQUIREMENTS),
        coverageStatus: fc.constantFrom(...AUDIT_COVERAGE_STATUSES),
        priorContext: fc.record({
          changedFilePartition: STATE_STORE_TEST_GENERATOR.scopeToken(),
          concernPartition: STATE_STORE_TEST_GENERATOR.scopeToken(),
          languagePartition: STATE_STORE_TEST_GENERATOR.scopeToken(),
        }),
        expectedProducer: arbitraryAuditProducerIdentity(),
        recordedByRunDriver: arbitraryAuditProducerIdentity(),
        producerProvenance: arbitraryAuditProducerProvenance(),
      })
    )
      .map((unit) => ({
        ...unit,
        auditClass: kind.auditClass,
        auditKind: kind.auditKind,
      }))
  );
}

function arbitraryCoverageGapAuditScopeUnit(): fc.Arbitrary<AuditScopeUnit> {
  return arbitraryCoverageGapAuditClassKind().chain((kind) =>
    arbitraryAuditScopeUnit().chain(({ parentUnitId: _parentUnitId, producerProvenance: _provenance, ...unit }) =>
      fc.constantFrom(...AUDIT_UNCOVERED_COVERAGE_STATUSES).map((coverageStatus) => ({
        ...unit,
        auditClass: kind.auditClass,
        auditKind: kind.auditKind,
        coverageStatus,
        priorContext: {
          changedFilePartition: unit.priorContext.changedFilePartition,
          concernPartition: unit.priorContext.concernPartition,
        },
      }))
    )
  );
}

function arbitraryAuditScopeUnitWithoutOptionalFields(): fc.Arbitrary<AuditScopeUnit> {
  return fc.oneof(
    arbitraryAuditScopeUnit().map(({ parentUnitId: _parentUnitId, ...unit }) => unit),
    arbitraryAuditScopeUnit().map(({ producerProvenance: _producerProvenance, ...unit }) => unit),
    arbitraryAuditScopeUnit().map((unit) => ({
      ...unit,
      priorContext: {
        changedFilePartition: unit.priorContext.changedFilePartition,
        concernPartition: unit.priorContext.concernPartition,
      },
    })),
    arbitraryCoverageGapAuditScopeUnit(),
  );
}

function arbitraryAuditFinding(): fc.Arbitrary<AuditFinding> {
  return fc.record({
    unitId: STATE_STORE_TEST_GENERATOR.scopeToken(),
    producerIdentity: arbitraryAuditProducerIdentity(),
    producerProvenance: arbitraryAuditProducerProvenance(),
    rule: STATE_STORE_TEST_GENERATOR.scopeToken(),
    severity: fc.constantFrom(...AUDIT_FINDING_SEVERITIES),
    location: arbitrarySourceFilePath(),
    message: STATE_STORE_TEST_GENERATOR.scopeToken(),
    evidence: fc.record({
      observed: STATE_STORE_TEST_GENERATOR.scopeToken(),
      expected: STATE_STORE_TEST_GENERATOR.scopeToken(),
    }),
  });
}

const SAMPLE_SEED = 0x5645524659;
const CHANGED_PATH_MIN = 1;
const CHANGED_PATH_MAX = 5;
const FINDING_BATCH_MIN = 1;
const FINDING_BATCH_MAX = 4;
const BLANK_CHARACTERS = [" ", "\t", "\n", "\r"] as const;
const BLANK_ARGUMENT_MAX = 4;

/** A review finding paired with the caller idempotency key that appends it. */
export interface FindingWithKey {
  readonly finding: ReviewFinding;
  readonly idempotencyKey: string;
}

export interface FileScopeIdentityScenario {
  readonly input: string;
  readonly normalized: string;
}

export interface FileScopeCanonicalizationScenario {
  readonly canonicalScope: string;
  readonly equivalentScope: string;
  readonly mismatchedScope: string;
}

export type VerifyScopeMappingCase =
  | {
    readonly scopeType: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET;
    readonly scope: string;
    readonly range: { readonly base: string; readonly head: string };
    readonly changedPaths: readonly string[];
    readonly expectedResolvedScope: readonly string[];
    readonly expectedSubject: VerificationContextSubject;
  }
  | {
    readonly scopeType: typeof VERIFICATION_CONTEXT_SUBJECT_KIND.FILE;
    readonly scope: string;
    readonly path: string;
    readonly expectedResolvedScope: readonly string[];
    readonly expectedSubject: VerificationContextSubject;
  };

export interface VerifyNonNounLocalEvidenceCase {
  readonly rejectedCommandName: (typeof VERIFICATION_RUN_CLI_SURFACE.forbiddenRunCommandNames)[number];
}

export interface VerifyEvidenceRequiredOptionCase {
  readonly resourceCommandName:
    | typeof VERIFICATION_RUN_CLI_SURFACE.scopeResourceCommandName
    | typeof VERIFICATION_RUN_CLI_SURFACE.findingResourceCommandName;
  readonly omittedOption: typeof VERIFY_CLI.payloadOption | typeof VERIFY_CLI.idempotencyKeyOption;
}

export function arbitrarySafeFileScopeIdentity(): fc.Arbitrary<string> {
  return arbitrarySourceFilePath();
}

export function arbitraryFileScopeIdentityScenario(): fc.Arbitrary<FileScopeIdentityScenario> {
  return fc.oneof(
    arbitrarySourceFilePath().map((path) => ({ input: path, normalized: path })),
    fc.tuple(STATE_STORE_TEST_GENERATOR.scopeToken(), arbitrarySourceFilePath()).map(([segment, path]) => ({
      input: `${segment}/${path}`,
      normalized: `${segment}/${path}`,
    })),
    arbitrarySourceFilePath().map((path) => ({
      input: path.replaceAll(
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.WINDOWS,
      ),
      normalized: path,
    })),
  );
}

export function arbitraryFileScopeCanonicalizationScenario(): fc.Arbitrary<FileScopeCanonicalizationScenario> {
  return arbitrarySafeFileScopeIdentity().map((path) => {
    const canonicalScope = [path, path].join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL);
    return {
      canonicalScope,
      equivalentScope: canonicalScope.replaceAll(
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.WINDOWS,
      ),
      mismatchedScope: [canonicalScope, path].join(
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
      ),
    };
  });
}

export function verifyScopeMappingCases(): readonly VerifyScopeMappingCase[] {
  const changeset = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetScopeScenario());
  const file = sampleVerifyTestValue(arbitraryFileScopeIdentityScenario());
  return [
    {
      scopeType: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
      scope: `${changeset.range.base}${VERIFY_SCOPE_SEPARATOR}${changeset.range.head}`,
      range: changeset.range,
      changedPaths: changeset.changedPaths,
      expectedResolvedScope: changeset.resolvedPaths,
      expectedSubject: {
        kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
        base: changeset.range.base,
        head: changeset.range.head,
      },
    },
    {
      scopeType: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
      scope: file.input,
      path: file.input,
      expectedResolvedScope: [file.normalized],
      expectedSubject: {
        kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
        path: file.normalized,
      },
    },
  ];
}

export function verifyNonNounLocalEvidenceCases(): readonly VerifyNonNounLocalEvidenceCase[] {
  return VERIFICATION_RUN_CLI_SURFACE.forbiddenRunCommandNames.map((rejectedCommandName) => ({
    rejectedCommandName,
  }));
}

export function verifyEvidenceRequiredOptionCases(): readonly VerifyEvidenceRequiredOptionCase[] {
  return [
    VERIFICATION_RUN_CLI_SURFACE.scopeResourceCommandName,
    VERIFICATION_RUN_CLI_SURFACE.findingResourceCommandName,
  ].flatMap((resourceCommandName) =>
    [VERIFY_CLI.payloadOption, VERIFY_CLI.idempotencyKeyOption].map((omittedOption) => ({
      resourceCommandName,
      omittedOption,
    }))
  );
}

export function arbitraryUnsafeFileScopeIdentity(): fc.Arbitrary<string> {
  return fc.oneof(
    arbitraryBlankArgument(),
    fc.constant(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.CURRENT_DIRECTORY),
    arbitrarySourceFilePath().map((path) => posix.resolve(posix.sep, path)),
    fc.tuple(fc.constantFrom("C", "D"), arbitrarySourceFilePath()).map(([drive, path]) =>
      win32.join(`${drive}:\\`, path)
    ),
    arbitrarySourceFilePath().map(
      (path) => `${VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.PREFIX}${path}`,
    ),
    fc.tuple(STATE_STORE_TEST_GENERATOR.scopeToken(), arbitrarySourceFilePath()).map(([segment, path]) =>
      [
        segment,
        VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT,
        path,
      ].join(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL)
    ),
  );
}

/**
 * The blank-argument domain: whitespace-only and empty strings a caller supplies when no real
 * `--input` source or `--run` token was given. The verify command trims and rejects these, so
 * the boundary tests explore the blank domain rather than asserting one hand-picked empty value.
 */
function arbitraryBlankArgument(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...BLANK_CHARACTERS), { minLength: 0, maxLength: BLANK_ARGUMENT_MAX })
    .map((characters) => characters.join(""));
}

/**
 * Build the `git diff --name-status -z <base>..<head>` stdout a changeset diff produces
 * for a set of modified paths, so a test can inject a realistic git response through the
 * git dependency and assert the changed-file scope the command derives from it. The status
 * marker and record separator are the source-owned git protocol constants of
 * `@/lib/git/name-status`; the paths are the generated domain the test explores.
 */
export function formatNameStatusZ(paths: readonly string[]): string {
  return paths.flatMap((path) => [GIT_MODIFY_STATUS_EXAMPLE, path]).join(GIT_NULL_RECORD_SEPARATOR);
}

export const VERIFY_TEST_GENERATOR = {
  verificationType: (): fc.Arbitrary<string> => fc.constantFrom(...VERIFY_VERIFICATION_TYPES),
  inheritedObjectPropertyName: (): fc.Arbitrary<string> =>
    fc.constantFrom(...Object.getOwnPropertyNames(Object.prototype)),
  changesetRef: (): fc.Arbitrary<string> =>
    STATE_STORE_TEST_GENERATOR.scopeToken().filter((value) => !value.startsWith("-")),
  changesetRange: (): fc.Arbitrary<{ readonly base: string; readonly head: string }> =>
    fc
      .tuple(VERIFY_TEST_GENERATOR.changesetRef(), VERIFY_TEST_GENERATOR.changesetRef())
      .filter(([base, head]) => base !== head)
      .map(([base, head]) => ({ base, head })),
  changesetScopeScenario: (): fc.Arbitrary<{
    readonly range: { readonly base: string; readonly head: string };
    readonly changedPaths: readonly string[];
    readonly resolvedPaths: readonly string[];
  }> =>
    fc.record({
      range: VERIFY_TEST_GENERATOR.changesetRange(),
      changedPaths: fc.uniqueArray(arbitrarySourceFilePath(), {
        minLength: CHANGED_PATH_MIN,
        maxLength: CHANGED_PATH_MAX,
      }),
    }).map(({ range, changedPaths }) => ({
      range,
      changedPaths,
      resolvedPaths: [...changedPaths].sort((left, right) => left.localeCompare(right)),
    })),
  distinctChangesetRanges: (): fc.Arbitrary<{
    readonly first: { readonly base: string; readonly head: string };
    readonly second: { readonly base: string; readonly head: string };
  }> =>
    fc
      .tuple(VERIFY_TEST_GENERATOR.changesetRange(), VERIFY_TEST_GENERATOR.changesetRange())
      .filter(([first, second]) => first.base !== second.base || first.head !== second.head)
      .map(([first, second]) => ({ first, second })),
  runLocatorScenario: (): fc.Arbitrary<{
    readonly verificationType: string;
    readonly range: { readonly base: string; readonly head: string };
    readonly scopeIdentity: string;
  }> =>
    fc.record({
      verificationType: VERIFY_TEST_GENERATOR.verificationType(),
      range: VERIFY_TEST_GENERATOR.changesetRange(),
    }).map(({ verificationType, range }) => ({
      verificationType,
      range,
      scopeIdentity: `${range.base}${VERIFY_SCOPE_SEPARATOR}${range.head}`,
    })),
  malformedChangesetScope: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  overlappingChangesetScope: (): fc.Arbitrary<string> =>
    fc
      .tuple(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken())
      .map(([base, head]) => `${base}${VERIFY_SCOPE_SEPARATOR}${VERIFY_SCOPE_SEPARATOR.slice(0, 1)}${head}`),
  runToken: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.runToken(),
  blankInputSource: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  blankRunToken: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  launchedAt: (): fc.Arbitrary<Date> =>
    fc.date({
      min: new Date("2026-01-01T00:00:00.000Z"),
      max: new Date("2026-12-31T23:59:59.999Z"),
      noInvalidDate: true,
    }),
  inputPayload: (): fc.Arbitrary<Record<string, string>> =>
    fc.dictionary(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken(), {
      minKeys: 1,
      maxKeys: 4,
    }),
  changedPaths: (): fc.Arbitrary<readonly string[]> =>
    fc.uniqueArray(arbitrarySourceFilePath(), { minLength: CHANGED_PATH_MIN, maxLength: CHANGED_PATH_MAX }),
  changedPathsPair: (): fc.Arbitrary<{ readonly first: readonly string[]; readonly second: readonly string[] }> =>
    fc
      .tuple(
        fc.uniqueArray(arbitrarySourceFilePath(), { minLength: CHANGED_PATH_MIN, maxLength: CHANGED_PATH_MAX }),
        fc.uniqueArray(arbitrarySourceFilePath(), { minLength: CHANGED_PATH_MIN, maxLength: CHANGED_PATH_MAX }),
      )
      .filter(([first, second]) =>
        [...first].sort((a, b) => a.localeCompare(b)).join() !== [...second].sort((a, b) => a.localeCompare(b)).join()
      )
      .map(([first, second]) => ({ first, second })),
  changesetChangedPathsPair: (): fc.Arbitrary<{
    readonly range: { readonly base: string; readonly head: string };
    readonly paths: { readonly first: readonly string[]; readonly second: readonly string[] };
  }> =>
    fc.record({
      range: VERIFY_TEST_GENERATOR.changesetRange(),
      paths: VERIFY_TEST_GENERATOR.changedPathsPair(),
    }),
  idempotencyKey: (): fc.Arbitrary<string> => STATE_STORE_TEST_GENERATOR.scopeToken(),
  idempotencyKeyPair: (): fc.Arbitrary<{ readonly first: string; readonly second: string }> =>
    fc
      .tuple(STATE_STORE_TEST_GENERATOR.scopeToken(), STATE_STORE_TEST_GENERATOR.scopeToken())
      .filter(([first, second]) => first !== second)
      .map(([first, second]) => ({ first, second })),
  blankIdempotencyKey: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  blankPayloadSource: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  reviewFinding: (): fc.Arbitrary<ReviewFinding> => arbitraryReviewFinding(),
  reviewTerminalStatus: (): fc.Arbitrary<string> => fc.constantFrom(...REVIEW_TERMINAL_STATUSES),
  distinctReviewTerminalStatuses: (): fc.Arbitrary<{ readonly first: string; readonly second: string }> =>
    fc
      .tuple(fc.constantFrom(...REVIEW_TERMINAL_STATUSES), fc.constantFrom(...REVIEW_TERMINAL_STATUSES))
      .filter(([first, second]) => first !== second)
      .map(([first, second]) => ({ first, second })),
  invalidTerminalStatus: (): fc.Arbitrary<string> =>
    STATE_STORE_TEST_GENERATOR.scopeToken().filter((value) => !TERMINAL_STATUSES.includes(value)),
  blankTerminalStatus: (): fc.Arbitrary<string> => arbitraryBlankArgument(),
  reviewFindingBatch: (): fc.Arbitrary<readonly FindingWithKey[]> =>
    fc.uniqueArray(
      fc.record({ finding: arbitraryReviewFinding(), idempotencyKey: STATE_STORE_TEST_GENERATOR.scopeToken() }),
      { selector: (entry) => entry.idempotencyKey, minLength: FINDING_BATCH_MIN, maxLength: FINDING_BATCH_MAX },
    ),
  reviewFindingAnchorVariants: (): fc.Arbitrary<readonly ReviewFinding[]> =>
    fc.tuple(
      arbitraryLineReviewFinding(),
      arbitraryProviderPositionReviewFinding(),
      arbitraryProviderLineAndPositionReviewFinding(),
    ),
  reviewFindingDisplayVariantPair: (): fc.Arbitrary<{
    readonly base: ReviewFinding;
    readonly variant: ReviewFinding;
  }> => arbitraryReviewFindingDisplayVariantPair(),
  reviewFindingIdentityDivergentPair: (): fc.Arbitrary<{
    readonly base: ReviewFinding;
    readonly divergent: ReviewFinding;
  }> => arbitraryReviewFindingIdentityDivergentPair(),
  reviewScopeUnitDisplayVariantPair: (): fc.Arbitrary<{
    readonly base: ReviewScopeUnit;
    readonly variant: ReviewScopeUnit;
  }> => arbitraryReviewScopeUnitDisplayVariantPair(),
  reviewScopeUnitKeyDivergentPair: (): fc.Arbitrary<{
    readonly base: ReviewScopeUnit;
    readonly divergent: ReviewScopeUnit;
  }> => arbitraryReviewScopeUnitKeyDivergentPair(),
  reviewRunSetScenario: (): fc.Arbitrary<ReviewRunSetScenario> => arbitraryReviewRunSetScenario(),
  invalidReviewFinding: (): fc.Arbitrary<unknown> =>
    fc.oneof(
      fc.constant(null),
      fc.integer(),
      fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
      fc.record({ path: arbitrarySourceFilePath(), body: STATE_STORE_TEST_GENERATOR.scopeToken() }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        line: fc.integer({ min: 1 }),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        finding: fc.record({
          disposition: arbitraryNonDisposition(),
          summary: STATE_STORE_TEST_GENERATOR.scopeToken(),
        }),
        line: fc.integer({ min: 1 }),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        finding: fc.record({
          disposition: fc.constantFrom(...REVIEW_FINDING_DISPOSITIONS),
          summary: fc.constant(EMPTY_SUMMARY),
        }),
        line: fc.integer({ min: 1 }),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        finding: arbitraryReviewFindingMetadata(),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        finding: arbitraryReviewFindingMetadata(),
        line: fc.constant(0),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        finding: arbitraryReviewFindingMetadata(),
        line: fc.integer({ min: 1 }),
        providerIdentity: fc.integer(),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        finding: arbitraryReviewFindingMetadata(),
        line: fc.integer({ min: 1 }),
        providerIdentity: fc.constant(EMPTY_REVIEW_BODY),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        originalCommit: STATE_STORE_TEST_GENERATOR.headSha(),
        diffHunk: STATE_STORE_TEST_GENERATOR.scopeToken(),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        finding: arbitraryReviewFindingMetadata(),
        line: fc.integer({ min: 1 }),
        url: fc.constant(EMPTY_REVIEW_BODY),
      }),
    ),
  reviewScopeUnit: (): fc.Arbitrary<ReviewScopeUnit> => arbitraryReviewScopeUnit(),
  auditScopeUnit: (): fc.Arbitrary<AuditScopeUnit> => arbitraryAuditScopeUnit(),
  auditScopeUnitWithoutOptionalFields: (): fc.Arbitrary<AuditScopeUnit> =>
    arbitraryAuditScopeUnitWithoutOptionalFields(),
  auditFinding: (): fc.Arbitrary<AuditFinding> => arbitraryAuditFinding(),
  invalidAuditScopeUnit: (): fc.Arbitrary<unknown> =>
    fc.oneof(
      fc.constant(null),
      fc.integer(),
      fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
      arbitraryAuditScopeUnit().map(({ unitId: _unitId, ...unit }) => unit),
      arbitraryAuditScopeUnit().map((unit) => ({
        ...unit,
        auditClass: AUDIT_CLASS.IMPLEMENTATION,
        auditKind: AUDIT_KIND.SKILL,
      })),
      arbitraryAuditScopeUnit().map((unit) => ({
        ...unit,
        auditClass: AUDIT_CLASS.INSTRUCTIONS,
        auditKind: AUDIT_KIND.CODE,
      })),
      arbitraryAuditScopeUnit().map((unit) => ({
        ...unit,
        auditClass: AUDIT_CLASS.SPEC,
        auditKind: AUDIT_KIND.SKILL,
      })),
      arbitraryAuditScopeUnit().chain((unit) =>
        STATE_STORE_TEST_GENERATOR.scopeToken().filter(
          (value) => !(AUDIT_COVERAGE_STATUSES as readonly string[]).includes(value),
        ).map((coverageStatus) => ({
          ...unit,
          coverageStatus,
        }))
      ),
      arbitraryAuditScopeUnit().chain((unit) =>
        fc.integer().map((parentUnitId) => ({
          ...unit,
          parentUnitId,
        }))
      ),
      arbitraryAuditScopeUnit().map((unit) => ({
        ...unit,
        parentUnitId: unit.unitId,
      })),
      arbitraryAuditScopeUnit().chain((unit) =>
        arbitraryAuditProducerProvenance().map((producerProvenance) => ({
          ...unit,
          auditKind: AUDIT_KIND.COVERAGE_GAP,
          producerProvenance,
        }))
      ),
      arbitraryAuditScopeUnit().map((unit) => ({
        ...unit,
        auditKind: AUDIT_KIND.COVERAGE_GAP,
        coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
        producerProvenance: undefined,
      })),
      arbitraryAuditScopeUnit().map((unit) => ({
        ...unit,
        auditKind: AUDIT_KIND.COVERAGE_GAP,
        coverageStatus: AUDIT_COVERAGE_STATUS.NOT_APPLICABLE,
        producerProvenance: undefined,
      })),
    ),
  invalidAuditFinding: (): fc.Arbitrary<unknown> =>
    fc.oneof(
      fc.constant(null),
      fc.integer(),
      fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
      arbitraryAuditFinding().map(({ unitId: _unitId, ...finding }) => finding),
      arbitraryAuditFinding().chain((finding) =>
        STATE_STORE_TEST_GENERATOR.scopeToken().filter(
          (value) => !(AUDIT_FINDING_SEVERITIES as readonly string[]).includes(value),
        ).map((severity) => ({
          ...finding,
          severity,
        }))
      ),
      arbitraryAuditFinding().map((finding) => ({
        ...finding,
        message: EMPTY_SUMMARY,
      })),
      arbitraryAuditFinding().map(({ producerProvenance: _producerProvenance, ...finding }) => finding),
      arbitraryAuditFinding().map((finding) => ({
        ...finding,
        producerIdentity: {
          ...finding.producerIdentity,
          producerKind: EMPTY_SUMMARY,
        },
      })),
      arbitraryAuditFinding().chain((finding) =>
        STATE_STORE_TEST_GENERATOR.scopeToken().map((evidence) => ({
          ...finding,
          evidence,
        }))
      ),
      arbitraryAuditFinding().map((finding) => ({
        ...finding,
        evidence: {},
      })),
      arbitraryAuditFinding().map((finding) => ({
        ...finding,
        evidence: {
          expected: finding.evidence.expected,
        },
      })),
      arbitraryAuditFinding().map((finding) => ({
        ...finding,
        evidence: {
          observed: finding.evidence.observed,
        },
      })),
    ),
  invalidReviewScopeUnit: (): fc.Arbitrary<unknown> =>
    fc.oneof(
      fc.constant(null),
      fc.integer(),
      fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
      fc.record({ path: arbitrarySourceFilePath(), commit: STATE_STORE_TEST_GENERATOR.headSha() }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        coverageState: STATE_STORE_TEST_GENERATOR.scopeToken().filter(
          (value) => !(REVIEW_SCOPE_COVERAGE_STATES as readonly string[]).includes(value),
        ),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        coverageState: fc.constantFrom(...REVIEW_SCOPE_COVERAGE_STATES),
        position: fc.constant(0),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        coverageState: fc.constantFrom(...REVIEW_SCOPE_COVERAGE_STATES),
        providerIdentity: fc.integer(),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        coverageState: fc.constantFrom(...REVIEW_SCOPE_COVERAGE_STATES),
        providerIdentity: fc.constant(EMPTY_REVIEW_BODY),
      }),
      fc.record({
        path: arbitrarySourceFilePath(),
        side: fc.constantFrom(...REVIEW_ANCHOR_SIDES),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        coverageState: fc.constantFrom(...REVIEW_SCOPE_COVERAGE_STATES),
        url: fc.constant(EMPTY_REVIEW_BODY),
      }),
    ),
  reviewTerminalMetadataVariants: (): fc.Arbitrary<readonly ReviewTerminalMetadata[]> =>
    fc.tuple(
      arbitraryReviewTerminalMetadata(REVIEW_TERMINAL_STATE.APPROVED),
      arbitraryReviewTerminalMetadataWithProvider(REVIEW_TERMINAL_STATE.APPROVED),
      arbitraryReviewTerminalMetadata(REVIEW_TERMINAL_STATE.CHANGES_REQUESTED),
      arbitraryReviewTerminalMetadata(REVIEW_TERMINAL_STATE.COMMENTED),
    ),
  reviewApprovedTerminalMetadata: (): fc.Arbitrary<ReviewTerminalMetadata> =>
    arbitraryReviewTerminalMetadata(REVIEW_TERMINAL_STATE.APPROVED),
  reviewApprovedTerminalMetadataWithProvider: (): fc.Arbitrary<ReviewTerminalMetadata> =>
    arbitraryReviewTerminalMetadataWithProvider(REVIEW_TERMINAL_STATE.APPROVED),
  reviewChangesRequestedTerminalMetadata: (): fc.Arbitrary<ReviewTerminalMetadata> =>
    arbitraryReviewTerminalMetadata(REVIEW_TERMINAL_STATE.CHANGES_REQUESTED),
  reviewCommentedTerminalMetadata: (): fc.Arbitrary<ReviewTerminalMetadata> =>
    arbitraryReviewTerminalMetadata(REVIEW_TERMINAL_STATE.COMMENTED),
  invalidReviewTerminalMetadata: (): fc.Arbitrary<unknown> =>
    fc.oneof(
      fc.constant(null),
      fc.integer(),
      fc.array(STATE_STORE_TEST_GENERATOR.scopeToken()),
      fc.record({ actor: STATE_STORE_TEST_GENERATOR.scopeToken(), body: STATE_STORE_TEST_GENERATOR.scopeToken() }),
      fc.record({
        actor: STATE_STORE_TEST_GENERATOR.scopeToken(),
        state: STATE_STORE_TEST_GENERATOR.scopeToken().filter(
          (value) => !(Object.values(REVIEW_TERMINAL_STATE) as readonly string[]).includes(value),
        ),
        body: STATE_STORE_TEST_GENERATOR.scopeToken(),
        submittedAt: VERIFY_TEST_GENERATOR.launchedAt().map((date) => date.toISOString()),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
      }),
      fc.record({
        actor: STATE_STORE_TEST_GENERATOR.scopeToken(),
        state: fc.constantFrom(...Object.values(REVIEW_TERMINAL_STATE)),
        body: fc.constant(EMPTY_REVIEW_BODY),
        submittedAt: VERIFY_TEST_GENERATOR.launchedAt().map((date) => date.toISOString()),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        url: fc.integer(),
      }),
      fc.record({
        actor: STATE_STORE_TEST_GENERATOR.scopeToken(),
        state: fc.constantFrom(...Object.values(REVIEW_TERMINAL_STATE)),
        body: fc.constant(EMPTY_REVIEW_BODY),
        submittedAt: VERIFY_TEST_GENERATOR.launchedAt().map((date) => date.toISOString()),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        providerIdentity: fc.constant(EMPTY_REVIEW_BODY),
      }),
      fc.record({
        actor: STATE_STORE_TEST_GENERATOR.scopeToken(),
        state: fc.constantFrom(...Object.values(REVIEW_TERMINAL_STATE)),
        body: fc.constant(EMPTY_REVIEW_BODY),
        submittedAt: VERIFY_TEST_GENERATOR.launchedAt().map((date) => date.toISOString()),
        commit: STATE_STORE_TEST_GENERATOR.headSha(),
        url: fc.constant(EMPTY_REVIEW_BODY),
      }),
    ),
  scopePayload: (): fc.Arbitrary<ReviewScopeUnit> => arbitraryReviewScopeUnit(),
  unsupportedVerificationType: (): fc.Arbitrary<string> =>
    STATE_STORE_TEST_GENERATOR.scopeToken().filter((value) => !VERIFY_VERIFICATION_TYPES.includes(value)),
} as const;

export function sampleVerifyTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: 1 });
  if (value === undefined) throw new Error("Verify test generator returned no sample");
  return value;
}

/** The required top-level fields of the review scope schema, drawn from the production vocabulary. */
const REQUIRED_REVIEW_SCOPE_FIELDS = [
  REVIEW_PAYLOAD_FIELD.PATH,
  REVIEW_PAYLOAD_FIELD.COMMIT,
  REVIEW_PAYLOAD_FIELD.SIDE,
  REVIEW_PAYLOAD_FIELD.COVERAGE_STATE,
] as const;

/** The required top-level fields of the review finding schema. */
const REQUIRED_REVIEW_FINDING_FIELDS = [
  REVIEW_PAYLOAD_FIELD.PATH,
  REVIEW_PAYLOAD_FIELD.ORIGINAL_COMMIT,
  REVIEW_PAYLOAD_FIELD.DIFF_HUNK,
  REVIEW_PAYLOAD_FIELD.BODY,
  REVIEW_PAYLOAD_FIELD.SIDE,
  REVIEW_PAYLOAD_FIELD.FINDING,
] as const;

/** One otherwise-valid review payload with a single named required field removed. */
export interface ReviewMissingFieldScenario {
  readonly payload: JsonValue;
  readonly missingField: string;
}

function reviewPayloadWithoutField(payload: unknown, field: string): JsonValue {
  const { [field]: _removed, ...rest } = JSON.parse(JSON.stringify(payload)) as { readonly [key: string]: JsonValue };
  return rest;
}

/** Review scope payloads each missing exactly one required field the schema declares. */
export function arbitraryReviewScopeMissingRequiredField(): fc.Arbitrary<ReviewMissingFieldScenario> {
  return fc
    .tuple(arbitraryReviewScopeUnit(), fc.constantFrom(...REQUIRED_REVIEW_SCOPE_FIELDS))
    .map(([unit, missingField]) => ({ payload: reviewPayloadWithoutField(unit, missingField), missingField }));
}

/** Review finding payloads each missing exactly one required field the schema declares. */
export function arbitraryReviewFindingMissingRequiredField(): fc.Arbitrary<ReviewMissingFieldScenario> {
  return fc
    .tuple(arbitraryReviewFinding(), fc.constantFrom(...REQUIRED_REVIEW_FINDING_FIELDS))
    .map(([finding, missingField]) => ({ payload: reviewPayloadWithoutField(finding, missingField), missingField }));
}

/**
 * A review finding payload anchored to neither a line nor a position. Every other required field
 * is present, so the payload reaches the anchor requirement rather than failing a field check.
 */
export function arbitraryReviewFindingWithoutAnchor(): fc.Arbitrary<JsonValue> {
  return arbitraryReviewFinding().map((finding) => {
    const {
      [REVIEW_PAYLOAD_FIELD.LINE]: _line,
      [REVIEW_PAYLOAD_FIELD.POSITION]: _position,
      ...anchorless
    } = JSON.parse(JSON.stringify(finding)) as { readonly [key: string]: JsonValue };
    return anchorless;
  });
}
