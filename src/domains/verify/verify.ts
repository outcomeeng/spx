import { join } from "node:path";

import { digestDescriptorSection } from "@/config/descriptor-digest";
import type { Result } from "@/config/types";
import { isJournalRunStateStatus, JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import type { EvidenceValidationResult } from "@/domains/verify/evidence-rejection";
import {
  acceptEvidence,
  EVIDENCE_REQUIREMENT,
  forwardEvidenceRejection,
  rejectEvidenceField,
  rejectEvidenceRequirement,
} from "@/domains/verify/evidence-rejection";
import type { JournalEvent, JournalEventInput, JsonValue } from "@/lib/agent-run-journal";
import { RUNTIME_EVENT_NAMESPACE_DEFAULT } from "@/lib/agent-run-journal/config";
import { branchScopeDir, runsDir, validateScopeToken } from "@/lib/state-store";

export const VERIFY_SCOPE_TYPE = {
  CHANGESET: "changeset",
  FILE: "file",
} as const;

export type VerifyScopeType = (typeof VERIFY_SCOPE_TYPE)[keyof typeof VERIFY_SCOPE_TYPE];

export interface VerifyRunSelector {
  readonly scopeType: VerifyScopeType;
  readonly scopeIdentity: string;
}

export const VERIFY_VERB = {
  START: "start",
  INPUT: "input",
  APPEND_SCOPE: "append-scope",
  APPEND_FINDING: "append-finding",
  FINISH: "finish",
  STATUS: "status",
  RENDER: "render",
} as const;

export type VerifyVerb = (typeof VERIFY_VERB)[keyof typeof VERIFY_VERB];

/** The public lifecycle actions a run still admits; a run's projection reports which remain legal. */
export const VERIFY_LIFECYCLE_ACTION = {
  SCOPE_ADD: "scope add",
  FINDING_ADD: "finding add",
  FINISH: VERIFY_VERB.FINISH,
} as const;

const UNSEALED_NEXT_ACTIONS: readonly string[] = [
  VERIFY_LIFECYCLE_ACTION.SCOPE_ADD,
  VERIFY_LIFECYCLE_ACTION.FINDING_ADD,
  VERIFY_LIFECYCLE_ACTION.FINISH,
];

/** The lifecycle actions a caller drives by appending its own evidence; an spx-driven run advertises none of them. */
const CALLER_EVIDENCE_APPEND_ACTIONS: readonly string[] = [
  VERIFY_LIFECYCLE_ACTION.SCOPE_ADD,
  VERIFY_LIFECYCLE_ACTION.FINDING_ADD,
];

/**
 * The party that drives a verification run to completion, recorded once at `start`. A caller drives
 * its own evidence appends; spx opens, streams, and seals the run within one invocation, so no
 * caller appends to an spx-driven run.
 */
export const VERIFY_DRIVE_MODE = {
  CALLER: "caller",
  SPX: "spx",
} as const;

export type VerifyDriveMode = (typeof VERIFY_DRIVE_MODE)[keyof typeof VERIFY_DRIVE_MODE];

const VERIFY_DRIVE_MODES: ReadonlySet<string> = new Set(Object.values(VERIFY_DRIVE_MODE));

/** Whether a value is a drive mode the run lifecycle records. */
export function isVerifyDriveMode(value: string): value is VerifyDriveMode {
  return VERIFY_DRIVE_MODES.has(value);
}

/** The unsealed next actions a run advertises for its drive mode: an spx-driven run drops the caller evidence-append actions. */
function unsealedNextActionsForDriveMode(driveMode: VerifyDriveMode): readonly string[] {
  if (driveMode === VERIFY_DRIVE_MODE.CALLER) return UNSEALED_NEXT_ACTIONS;
  return UNSEALED_NEXT_ACTIONS.filter((action) => !CALLER_EVIDENCE_APPEND_ACTIONS.includes(action));
}

/**
 * The verification types whose evidence payloads the run lifecycle validates, whether a caller
 * appends them through `spx verification run finding add` or spx streams them while it drives the
 * type's runner. Each type registers scope, finding, and terminal validators (see
 * `EVIDENCE_VALIDATORS`); dispatch is a registry lookup keyed by this vocabulary, never
 * verification-type-name branching.
 */
export const VERIFY_VERIFICATION_TYPE = {
  AUDIT: "audit",
  REVIEW: "review",
  TEST: "test",
} as const;

export type VerifyVerificationType = (typeof VERIFY_VERIFICATION_TYPE)[keyof typeof VERIFY_VERIFICATION_TYPE];

const VERIFY_VERIFICATION_TYPES: ReadonlySet<string> = new Set(Object.values(VERIFY_VERIFICATION_TYPE));

/** Whether the caller named a verification type whose run lifecycle SPX can validate. */
export function isVerifyVerificationType(value: string): value is VerifyVerificationType {
  return VERIFY_VERIFICATION_TYPES.has(value);
}

/** The receiver-action classes a review finding carries, per the merge lifecycle's finding disposition. */
export const REVIEW_FINDING_DISPOSITION = {
  BLOCKING: "BLOCKING",
  DEBT: "DEBT",
} as const;

export type ReviewFindingDisposition = (typeof REVIEW_FINDING_DISPOSITION)[keyof typeof REVIEW_FINDING_DISPOSITION];

export interface ReviewFindingMetadata {
  readonly disposition: ReviewFindingDisposition;
  readonly summary: string;
}

/**
 * A validated `review` verification finding: a platform-neutral anchored review comment plus the
 * SPX receiver-action metadata that makes the comment a finding.
 */
export interface ReviewFinding {
  readonly path: string;
  readonly side: ReviewAnchorSide;
  readonly originalCommit: string;
  readonly diffHunk: string;
  readonly body: string;
  readonly finding: ReviewFindingMetadata;
  readonly providerIdentity?: string;
  readonly line?: number;
  readonly position?: number;
  readonly url?: string;
}

export const REVIEW_SCOPE_COVERAGE_STATE = {
  CLEAN: "clean",
  FINDING: "finding",
} as const;

export type ReviewScopeCoverageState = (typeof REVIEW_SCOPE_COVERAGE_STATE)[keyof typeof REVIEW_SCOPE_COVERAGE_STATE];

export const REVIEW_ANCHOR_SIDE = {
  LEFT: "LEFT",
  RIGHT: "RIGHT",
} as const;

export type ReviewAnchorSide = (typeof REVIEW_ANCHOR_SIDE)[keyof typeof REVIEW_ANCHOR_SIDE];

export const REVIEW_TERMINAL_STATE = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "commented",
} as const;

export type ReviewTerminalState = (typeof REVIEW_TERMINAL_STATE)[keyof typeof REVIEW_TERMINAL_STATE];

/** The journal terminal statuses a review run seals with; a foreign runner status never seals a review. */
export const REVIEW_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  JOURNAL_RUN_STATE_STATUS.APPROVED,
  JOURNAL_RUN_STATE_STATUS.REJECTED,
]);

export interface ReviewScopeUnit {
  readonly path: string;
  readonly side: ReviewAnchorSide;
  readonly commit: string;
  readonly coverageState: ReviewScopeCoverageState;
  readonly providerIdentity?: string;
  readonly line?: number;
  readonly position?: number;
  readonly url?: string;
}

export interface ReviewTerminalMetadata {
  readonly actor: string;
  readonly state: ReviewTerminalState;
  readonly body: string;
  readonly submittedAt: string;
  readonly commit: string;
  readonly providerIdentity?: string;
  readonly url?: string;
}

export const AUDIT_CLASS = {
  IMPLEMENTATION: "implementation",
  INSTRUCTIONS: "instructions",
  SPEC: "spec",
} as const;

export type AuditClass = (typeof AUDIT_CLASS)[keyof typeof AUDIT_CLASS];

export const AUDIT_KIND = {
  ADR: "adr",
  ARCHITECTURE: "architecture",
  CODE: "code",
  COVERAGE_GAP: "coverage-gap",
  EVAL_EVIDENCE: "eval-evidence",
  GUIDE_TEMPLATE: "guide-template",
  PDR: "pdr",
  PROMPT: "prompt",
  SKILL: "skill",
  SPEC: "spec",
  SUBAGENT: "subagent",
  TESTS: "tests",
} as const;

export type AuditKind = (typeof AUDIT_KIND)[keyof typeof AUDIT_KIND];

export const AUDIT_COVERAGE_REQUIREMENT = {
  OPTIONAL: "optional",
  REQUIRED: "required",
} as const;

export type AuditCoverageRequirement = (typeof AUDIT_COVERAGE_REQUIREMENT)[keyof typeof AUDIT_COVERAGE_REQUIREMENT];

export const AUDIT_COVERAGE_STATUS = {
  AUDITED: "audited",
  INCOMPLETE: "incomplete",
  MISSING_SKILL: "missing-skill",
  NOT_APPLICABLE: "not-applicable",
  SKIPPED: "skipped",
  UNSUPPORTED: "unsupported",
} as const;

export type AuditCoverageStatus = (typeof AUDIT_COVERAGE_STATUS)[keyof typeof AUDIT_COVERAGE_STATUS];

export const AUDIT_FINDING_SEVERITY = {
  BLOCKING: "blocking",
  DEBT: "debt",
} as const;

export type AuditFindingSeverity = (typeof AUDIT_FINDING_SEVERITY)[keyof typeof AUDIT_FINDING_SEVERITY];

export interface AuditProducerIdentity {
  readonly producerKind: string;
  readonly agentName: string;
  readonly agentOwningPluginName: string;
  readonly skillName: string;
  readonly skillOwningPluginName: string;
  readonly invocationRole: string;
}

export interface AuditProducerProvenance {
  readonly agentOwningPluginVersion: string;
  readonly skillOwningPluginVersion: string;
  readonly toolVersion?: string;
}

export interface AuditPriorContextPartitions {
  readonly changedFilePartition: string;
  readonly concernPartition: string;
  readonly languagePartition?: string;
}

export interface AuditScopeUnit {
  readonly unitId: string;
  readonly auditClass: AuditClass;
  readonly auditKind: AuditKind;
  readonly subject: string;
  readonly coverageRequirement: AuditCoverageRequirement;
  readonly coverageStatus: AuditCoverageStatus;
  readonly priorContext: AuditPriorContextPartitions;
  readonly expectedProducer: AuditProducerIdentity;
  readonly recordedByRunDriver: AuditProducerIdentity;
  readonly parentUnitId?: string;
  readonly producerProvenance?: AuditProducerProvenance;
}

export interface AuditPriorContextSelector {
  readonly auditClass: AuditClass;
  readonly auditKind: AuditKind;
  readonly expectedProducer: AuditProducerIdentity;
  readonly subjectPath: string;
  readonly changedFilePartition: string;
  readonly concernPartition: string;
  readonly languagePartition?: string;
  readonly producerIdentity?: AuditProducerIdentity;
}

export interface AuditFinding {
  readonly unitId: string;
  readonly producerIdentity: AuditProducerIdentity;
  readonly producerProvenance: AuditProducerProvenance;
  readonly rule: string;
  readonly severity: AuditFindingSeverity;
  readonly location: string;
  readonly message: string;
  readonly evidence: { readonly [key: string]: JsonValue };
}

export function auditPriorContextSelectorForScopeUnit(unit: AuditScopeUnit): AuditPriorContextSelector {
  return {
    auditClass: unit.auditClass,
    auditKind: unit.auditKind,
    expectedProducer: unit.expectedProducer,
    subjectPath: unit.subject,
    changedFilePartition: unit.priorContext.changedFilePartition,
    concernPartition: unit.priorContext.concernPartition,
    ...(unit.priorContext.languagePartition === undefined
      ? {}
      : { languagePartition: unit.priorContext.languagePartition }),
    producerIdentity: unit.recordedByRunDriver,
  };
}

export function filterAuditScopeUnitsForPriorContext(
  units: readonly AuditScopeUnit[],
  selector: AuditPriorContextSelector,
): readonly AuditScopeUnit[] {
  return units.filter((unit) => auditScopeUnitMatchesPriorContextSelector(unit, selector));
}

function auditScopeUnitMatchesPriorContextSelector(
  unit: AuditScopeUnit,
  selector: AuditPriorContextSelector,
): boolean {
  return (
    unit.auditClass === selector.auditClass
    && unit.auditKind === selector.auditKind
    && unit.subject === selector.subjectPath
    && unit.priorContext.changedFilePartition === selector.changedFilePartition
    && unit.priorContext.concernPartition === selector.concernPartition
    && unit.priorContext.languagePartition === selector.languagePartition
    && auditProducerIdentityMatches(unit.expectedProducer, selector.expectedProducer)
    && auditProducedByIdentityMatches(unit, selector.producerIdentity)
  );
}

function auditProducedByIdentityMatches(
  unit: AuditScopeUnit,
  producerIdentity: AuditProducerIdentity | undefined,
): boolean {
  if (producerIdentity === undefined) return true;
  return auditProducerIdentityMatches(unit.recordedByRunDriver, producerIdentity);
}

function auditProducerIdentityMatches(left: AuditProducerIdentity, right: AuditProducerIdentity): boolean {
  return (
    left.producerKind === right.producerKind
    && left.agentName === right.agentName
    && left.agentOwningPluginName === right.agentOwningPluginName
    && left.skillName === right.skillName
    && left.skillOwningPluginName === right.skillOwningPluginName
    && left.invocationRole === right.invocationRole
  );
}

export interface TerminalValidationInput {
  readonly terminalStatus: string;
  readonly metadata?: JsonValue;
  readonly events: readonly JournalEvent[];
  readonly selector: VerifyRunSelector;
}

export const TERMINAL_METADATA_VALIDATION_ERROR = {
  METADATA_INVALID: "metadata-invalid",
  STATUS_CONFLICT: "status-conflict",
} as const;

export type TerminalMetadataValidationError =
  (typeof TERMINAL_METADATA_VALIDATION_ERROR)[keyof typeof TERMINAL_METADATA_VALIDATION_ERROR];

/**
 * A terminal-completion validation outcome. A rejection names the class of refusal the command
 * layer branches on and carries the reason a reader needs: which metadata field failed, or which
 * status the run's own evidence requires instead.
 */
export type TerminalMetadataValidationResult =
  | { readonly ok: true; readonly value: JsonValue | undefined }
  | {
    readonly ok: false;
    readonly error: TerminalMetadataValidationError;
    readonly reason: string;
  };

/** The structural requirements a terminal status can fail against a run's recorded evidence. */
export const TERMINAL_REQUIREMENT = {
  STATUS_IN_TYPE_VOCABULARY: "the terminal status is one the verification type seals with",
  STATUS_MATCHES_EVIDENCE: "the terminal status matches the status the run's recorded evidence requires",
  METADATA_MATCHES_EVIDENCE: "the terminal metadata agrees with the run's recorded evidence",
  NO_METADATA_ACCEPTED: "the verification type seals with no terminal metadata",
  PASSED_HAS_NO_FINDINGS: "a run sealing as passed recorded no findings",
} as const;

export type TerminalRequirement = (typeof TERMINAL_REQUIREMENT)[keyof typeof TERMINAL_REQUIREMENT];

const TERMINAL_REASON_PREFIX = "terminal completion does not satisfy: ";

function rejectTerminal(
  error: TerminalMetadataValidationError,
  requirement: TerminalRequirement,
): TerminalMetadataValidationResult {
  return { ok: false, error, reason: `${TERMINAL_REASON_PREFIX}${requirement}` };
}

function rejectTerminalMetadata(reason: string): TerminalMetadataValidationResult {
  return { ok: false, error: TERMINAL_METADATA_VALIDATION_ERROR.METADATA_INVALID, reason };
}

export const VERIFY_EVIDENCE_KIND = {
  SCOPE: "scope",
  FINDING: "finding",
  TERMINAL_METADATA: "terminal-metadata",
} as const;

export type VerifyEvidenceKind = (typeof VERIFY_EVIDENCE_KIND)[keyof typeof VERIFY_EVIDENCE_KIND];

/** The CloudEvents `type` each append verb records, distinguishing inspected scope from findings. */
export const VERIFY_APPEND_EVENT_TYPE = {
  SCOPE: `${RUNTIME_EVENT_NAMESPACE_DEFAULT}.verify.scope`,
  FINDING: `${RUNTIME_EVENT_NAMESPACE_DEFAULT}.verify.finding`,
} as const;

export type VerifyAppendEventType = (typeof VERIFY_APPEND_EVENT_TYPE)[keyof typeof VERIFY_APPEND_EVENT_TYPE];

/** The CloudEvents `source` every verification-run evidence append event carries. */
export const VERIFY_EVENT_SOURCE = "/spx/verify" as const;

/** The `data` fields an append event records: the caller idempotency key and the appended payload. */
export const VERIFY_APPEND_EVENT_FIELD = {
  IDEMPOTENCY_KEY: "idempotencyKey",
  PAYLOAD: "payload",
} as const;

export const VERIFY_INPUT_SOURCE = {
  STDIN: "stdin",
} as const;

export type VerifyInputSource = (typeof VERIFY_INPUT_SOURCE)[keyof typeof VERIFY_INPUT_SOURCE];

export const VERIFY_SCOPE_SEPARATOR = "..";

export const VERIFY_SCOPE_ERROR = {
  MALFORMED_CHANGESET: "verify changeset scope must be <base>..<head>",
  MALFORMED_FILE: "verify file scope must be a safe product-relative path",
  UNSUPPORTED_SCOPE_TYPE: "verify scope type has no verification-context substrate representation",
} as const;

/** The digest-path label the recorded run input is canonicalized under before hashing. */
export const VERIFY_INPUT_DIGEST_PATH = "verify run input";

export interface ChangesetScope {
  readonly base: string;
  readonly head: string;
}

/**
 * Split a `<base>..<head>` changeset scope operand into its two refs. A missing separator,
 * an empty ref, or a second separator is malformed and rejected before the command resolves
 * a subject, so a caller cannot open a run over an unrepresentable scope.
 */
export function parseChangesetScope(scope: string): Result<ChangesetScope> {
  const separatorIndex = scope.indexOf(VERIFY_SCOPE_SEPARATOR);
  if (separatorIndex < 0) {
    return { ok: false, error: VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET };
  }
  const secondSeparatorIndex = scope.indexOf(VERIFY_SCOPE_SEPARATOR, separatorIndex + 1);
  const base = scope.slice(0, separatorIndex);
  const head = scope.slice(separatorIndex + VERIFY_SCOPE_SEPARATOR.length);
  if (
    base.length === 0
    || head.length === 0
    || secondSeparatorIndex >= 0
  ) {
    return { ok: false, error: VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET };
  }
  return { ok: true, value: { base, head } };
}

/**
 * A run locator names every resolved selector a caller persists to address the run later:
 * the run token plus the verification type, scope type, scope identity, backend identity,
 * storage namespace, and the journal run path or backend target the run persists to.
 */
export interface RunLocator {
  readonly runToken: string;
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scopeIdentity: string;
  readonly backendIdentity: string;
  readonly storageNamespace: string;
  readonly runTarget: string;
}

/** Assemble a run locator from the resolved selectors and run target. */
export function buildRunLocator(parts: RunLocator): RunLocator {
  return {
    runToken: parts.runToken,
    verificationType: parts.verificationType,
    scopeType: parts.scopeType,
    scopeIdentity: parts.scopeIdentity,
    backendIdentity: parts.backendIdentity,
    storageNamespace: parts.storageNamespace,
    runTarget: parts.runTarget,
  };
}

/**
 * A recorded verification input's replayable descriptor: the source the input was read from
 * and the canonical digest recorded at start, so the `input` verb replays the exact input.
 */
export interface InputDescriptor {
  readonly source: string;
  readonly digest: string;
}

/**
 * Digest a recorded run input canonically over its source and content, so the same input
 * yields the same descriptor digest for replay verification independent of the run token.
 */
export function digestRunInput(
  source: string,
  content: string,
): Result<string> {
  const digest = digestDescriptorSection(
    { source, content },
    VERIFY_INPUT_DIGEST_PATH,
  );
  if (!digest.ok) return digest;
  return { ok: true, value: digest.value.sha256 };
}

/** The filename affixes for a run's persisted input record, a sibling of its run journal. */
export const VERIFY_INPUT_RECORD = {
  PREFIX: "input-",
  SUFFIX: ".json",
} as const;

/** The scope that addresses one run's persisted artifacts under the state store. */
export interface VerifyRunScope {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly type: string;
  readonly runToken: string;
}

/** A recorded run input persisted at start and replayed by the `input` verb. */
export interface RecordedInput {
  readonly scopeIdentity: string;
  readonly scopeType: string;
  readonly source: string;
  readonly digest: string;
  readonly content: string;
}

/**
 * The run's storage namespace — the state-store runs directory
 * `.spx/branch/<branch-slug>/<type>/runs` its journal and input record persist under.
 */
export function verifyRunsDir(
  scope: Omit<VerifyRunScope, "runToken">,
): Result<string> {
  const branchScope = branchScopeDir(scope.productDir, scope.branchSlug);
  if (!branchScope.ok) return branchScope;
  return runsDir(branchScope.value, scope.type);
}

/**
 * The run's input-record path, a validated sibling of its run journal in the runs directory.
 * The run token is validated for path safety, so a caller-supplied token cannot escape the
 * runs directory.
 */
export function verifyInputRecordPath(scope: VerifyRunScope): Result<string> {
  const runs = verifyRunsDir(scope);
  if (!runs.ok) return runs;
  const token = validateScopeToken(scope.runToken);
  if (!token.ok) return token;
  return {
    ok: true,
    value: join(
      runs.value,
      `${VERIFY_INPUT_RECORD.PREFIX}${token.value}${VERIFY_INPUT_RECORD.SUFFIX}`,
    ),
  };
}

/** The CloudEvents `attempt` an append event carries; verify records one attempt per idempotent append. */
export const VERIFY_APPEND_ATTEMPT = 1;

/** Parse an append payload source's content as JSON, returning `undefined` for malformed input. */
export function parseAppendPayload(raw: string): JsonValue | undefined {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return undefined;
  }
}

function isJsonRecord(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  record: { readonly [key: string]: JsonValue },
  field: string,
): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRequiredStringValue(
  record: { readonly [key: string]: JsonValue },
  field: string,
): string | undefined {
  const value = record[field];
  return typeof value === "string" ? value : undefined;
}

const OPTIONAL_FIELD_STATE = {
  ABSENT: "absent",
  INVALID: "invalid",
  PRESENT: "present",
} as const;

type OptionalField<T> =
  | { readonly state: typeof OPTIONAL_FIELD_STATE.ABSENT }
  | { readonly state: typeof OPTIONAL_FIELD_STATE.INVALID }
  | { readonly state: typeof OPTIONAL_FIELD_STATE.PRESENT; readonly value: T };

function readOptionalString(
  record: { readonly [key: string]: JsonValue },
  field: string,
): OptionalField<string> {
  if (!(field in record)) return { state: OPTIONAL_FIELD_STATE.ABSENT };
  const value = record[field];
  return typeof value === "string" && value.length > 0
    ? { state: OPTIONAL_FIELD_STATE.PRESENT, value }
    : { state: OPTIONAL_FIELD_STATE.INVALID };
}

function readOptionalPositiveInteger(
  record: { readonly [key: string]: JsonValue },
  field: string,
): OptionalField<number> {
  if (!(field in record)) return { state: OPTIONAL_FIELD_STATE.ABSENT };
  const value = record[field];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? { state: OPTIONAL_FIELD_STATE.PRESENT, value }
    : { state: OPTIONAL_FIELD_STATE.INVALID };
}

function optionalFieldValue<T>(field: OptionalField<T>): T | undefined {
  return field.state === OPTIONAL_FIELD_STATE.PRESENT ? field.value : undefined;
}

function readRequiredRecord(
  record: { readonly [key: string]: JsonValue },
  field: string,
): { readonly [key: string]: JsonValue } | undefined {
  const value = record[field];
  return isJsonRecord(value) ? value : undefined;
}

function readOptionalRecord(
  record: { readonly [key: string]: JsonValue },
  field: string,
): OptionalField<{ readonly [key: string]: JsonValue }> {
  if (!(field in record)) return { state: OPTIONAL_FIELD_STATE.ABSENT };
  const value = record[field];
  return isJsonRecord(value)
    ? { state: OPTIONAL_FIELD_STATE.PRESENT, value }
    : { state: OPTIONAL_FIELD_STATE.INVALID };
}

/**
 * Read several required string fields at once, refusing at the first one missing or malformed.
 * Reading them as a set keeps a validator's per-field reasons without one branch per field.
 */
function readRequiredStrings<K extends string>(
  record: { readonly [key: string]: JsonValue },
  fields: readonly K[],
  ...path: readonly string[]
): EvidenceValidationResult<{ readonly [field in K]: string }> {
  const read = {} as { [field in K]: string };
  for (const field of fields) {
    const value = readRequiredString(record, field);
    if (value === undefined) return rejectEvidenceField(...path, field);
    read[field] = value;
  }
  return acceptEvidence(read);
}

/**
 * Check several already-read optional fields at once, refusing at the first malformed one. An
 * absent optional field is valid; only a present-but-malformed value refuses.
 */
function requireValidOptionalFields(
  reads: readonly (readonly [string, OptionalField<unknown>])[],
  ...path: readonly string[]
): EvidenceValidationResult<undefined> {
  const invalid = reads.find(([, field]) => field.state === OPTIONAL_FIELD_STATE.INVALID);
  return invalid === undefined ? acceptEvidence(undefined) : rejectEvidenceField(...path, invalid[0]);
}

function isReviewFindingDisposition(
  value: JsonValue | undefined,
): value is ReviewFindingDisposition {
  return (
    Object.values(REVIEW_FINDING_DISPOSITION) as readonly string[]
  ).includes(value as string);
}

function isReviewScopeCoverageState(
  value: JsonValue | undefined,
): value is ReviewScopeCoverageState {
  return (
    typeof value === "string"
    && (Object.values(REVIEW_SCOPE_COVERAGE_STATE) as readonly string[]).includes(value)
  );
}

function isReviewAnchorSide(value: JsonValue | undefined): value is ReviewAnchorSide {
  return (
    typeof value === "string"
    && (Object.values(REVIEW_ANCHOR_SIDE) as readonly string[]).includes(value)
  );
}

function isReviewTerminalState(value: JsonValue | undefined): value is ReviewTerminalState {
  return (
    typeof value === "string"
    && (Object.values(REVIEW_TERMINAL_STATE) as readonly string[]).includes(value)
  );
}

function isAuditClass(value: JsonValue | undefined): value is AuditClass {
  return typeof value === "string" && (Object.values(AUDIT_CLASS) as readonly string[]).includes(value);
}

function isAuditKind(value: JsonValue | undefined): value is AuditKind {
  return typeof value === "string" && (Object.values(AUDIT_KIND) as readonly string[]).includes(value);
}

function isAuditCoverageRequirement(value: JsonValue | undefined): value is AuditCoverageRequirement {
  return (
    typeof value === "string" && (Object.values(AUDIT_COVERAGE_REQUIREMENT) as readonly string[]).includes(value)
  );
}

function isAuditCoverageStatus(value: JsonValue | undefined): value is AuditCoverageStatus {
  return typeof value === "string" && (Object.values(AUDIT_COVERAGE_STATUS) as readonly string[]).includes(value);
}

function isAuditFindingSeverity(value: JsonValue | undefined): value is AuditFindingSeverity {
  return typeof value === "string" && (Object.values(AUDIT_FINDING_SEVERITY) as readonly string[]).includes(value);
}

function isCompatibleAuditKind(auditClass: AuditClass, auditKind: AuditKind): boolean {
  if (auditKind === AUDIT_KIND.COVERAGE_GAP) return true;
  if (auditClass === AUDIT_CLASS.INSTRUCTIONS) {
    return (
      auditKind === AUDIT_KIND.SKILL
      || auditKind === AUDIT_KIND.SUBAGENT
      || auditKind === AUDIT_KIND.PROMPT
      || auditKind === AUDIT_KIND.GUIDE_TEMPLATE
    );
  }
  if (auditClass === AUDIT_CLASS.SPEC) {
    return auditKind === AUDIT_KIND.SPEC || auditKind === AUDIT_KIND.ADR || auditKind === AUDIT_KIND.PDR;
  }
  return (
    auditKind === AUDIT_KIND.CODE
    || auditKind === AUDIT_KIND.TESTS
    || auditKind === AUDIT_KIND.ARCHITECTURE
    || auditKind === AUDIT_KIND.EVAL_EVIDENCE
  );
}

export interface EvidenceValidationInput {
  readonly payload: JsonValue;
  readonly events: readonly JournalEvent[];
  readonly selector: VerifyRunSelector;
}

export type EvidenceValidator = (input: EvidenceValidationInput) => EvidenceValidationResult<unknown>;
export type TerminalMetadataValidator = (input: TerminalValidationInput) => TerminalMetadataValidationResult;

function evidencePayloadValidator(
  validator: (payload: JsonValue) => EvidenceValidationResult<unknown>,
): EvidenceValidator {
  return (input) => validator(input.payload);
}

/** The field names the `review` finding, scope, and terminal-metadata payload schemas declare. */
export const REVIEW_PAYLOAD_FIELD = {
  PATH: "path",
  ORIGINAL_COMMIT: "originalCommit",
  DIFF_HUNK: "diffHunk",
  BODY: "body",
  SIDE: "side",
  FINDING: "finding",
  DISPOSITION: "disposition",
  SUMMARY: "summary",
  LINE: "line",
  POSITION: "position",
  PROVIDER_IDENTITY: "providerIdentity",
  URL: "url",
  COMMIT: "commit",
  COVERAGE_STATE: "coverageState",
  ACTOR: "actor",
  STATE: "state",
  SUBMITTED_AT: "submittedAt",
} as const;

/** The required string-valued fields of the `review` finding schema, read as one set. */
const REQUIRED_REVIEW_FINDING_STRING_FIELDS = [
  REVIEW_PAYLOAD_FIELD.PATH,
  REVIEW_PAYLOAD_FIELD.ORIGINAL_COMMIT,
  REVIEW_PAYLOAD_FIELD.DIFF_HUNK,
  REVIEW_PAYLOAD_FIELD.BODY,
] as const;

/** The field names the `audit` scope, finding, and nested identity payload schemas declare. */
export const AUDIT_PAYLOAD_FIELD = {
  UNIT_ID: "unitId",
  PARENT_UNIT_ID: "parentUnitId",
  SUBJECT: "subject",
  AUDIT_CLASS: "auditClass",
  AUDIT_KIND: "auditKind",
  COVERAGE_REQUIREMENT: "coverageRequirement",
  COVERAGE_STATUS: "coverageStatus",
  PRIOR_CONTEXT: "priorContext",
  EXPECTED_PRODUCER: "expectedProducer",
  RECORDED_BY_RUN_DRIVER: "recordedByRunDriver",
  PRODUCER_IDENTITY: "producerIdentity",
  PRODUCER_PROVENANCE: "producerProvenance",
  PRODUCER_KIND: "producerKind",
  AGENT_NAME: "agentName",
  AGENT_OWNING_PLUGIN_NAME: "agentOwningPluginName",
  SKILL_NAME: "skillName",
  SKILL_OWNING_PLUGIN_NAME: "skillOwningPluginName",
  INVOCATION_ROLE: "invocationRole",
  AGENT_OWNING_PLUGIN_VERSION: "agentOwningPluginVersion",
  SKILL_OWNING_PLUGIN_VERSION: "skillOwningPluginVersion",
  TOOL_VERSION: "toolVersion",
  CHANGED_FILE_PARTITION: "changedFilePartition",
  CONCERN_PARTITION: "concernPartition",
  LANGUAGE_PARTITION: "languagePartition",
  RULE: "rule",
  SEVERITY: "severity",
  LOCATION: "location",
  MESSAGE: "message",
  EVIDENCE: "evidence",
  OBSERVED: "observed",
  EXPECTED: "expected",
} as const;

/** The required string-valued fields of the `audit` scope schema, read as one set. */
const REQUIRED_AUDIT_SCOPE_STRING_FIELDS = [
  AUDIT_PAYLOAD_FIELD.UNIT_ID,
  AUDIT_PAYLOAD_FIELD.SUBJECT,
] as const;

/** The required string-valued fields of the `audit` finding schema, read as one set. */
const REQUIRED_AUDIT_FINDING_STRING_FIELDS = [
  AUDIT_PAYLOAD_FIELD.UNIT_ID,
  AUDIT_PAYLOAD_FIELD.RULE,
  AUDIT_PAYLOAD_FIELD.LOCATION,
  AUDIT_PAYLOAD_FIELD.MESSAGE,
] as const;

/** The field names the `test` scope and finding payload schemas declare. */
export const TEST_PAYLOAD_FIELD = {
  MODULE_ID: "moduleId",
  TEST_NAME: "testName",
  ERRORS: "errors",
} as const;

function readReviewFindingMetadata(
  payload: JsonValue | undefined,
  ...path: readonly string[]
): EvidenceValidationResult<ReviewFindingMetadata> {
  if (!isJsonRecord(payload)) return rejectEvidenceField(...path);
  const { disposition, summary } = payload;
  if (!isReviewFindingDisposition(disposition)) {
    return rejectEvidenceField(...path, REVIEW_PAYLOAD_FIELD.DISPOSITION);
  }
  if (typeof summary !== "string" || summary.length === 0) {
    return rejectEvidenceField(...path, REVIEW_PAYLOAD_FIELD.SUMMARY);
  }
  return acceptEvidence({ disposition, summary });
}

/** Validate a `review` finding payload as a platform-neutral anchored review comment. */
export function validateReviewFinding(payload: JsonValue): EvidenceValidationResult<ReviewFinding> {
  if (!isJsonRecord(payload)) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  const required = readRequiredStrings(payload, REQUIRED_REVIEW_FINDING_STRING_FIELDS);
  if (!required.ok) return forwardEvidenceRejection(required);
  const { side } = payload;
  if (!isReviewAnchorSide(side)) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.SIDE);
  const finding = readReviewFindingMetadata(payload.finding, REVIEW_PAYLOAD_FIELD.FINDING);
  if (!finding.ok) return forwardEvidenceRejection(finding);
  const line = readOptionalPositiveInteger(payload, REVIEW_PAYLOAD_FIELD.LINE);
  const position = readOptionalPositiveInteger(payload, REVIEW_PAYLOAD_FIELD.POSITION);
  const providerIdentity = readOptionalString(payload, REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY);
  const url = readOptionalString(payload, REVIEW_PAYLOAD_FIELD.URL);
  const optional = requireValidOptionalFields([
    [REVIEW_PAYLOAD_FIELD.LINE, line],
    [REVIEW_PAYLOAD_FIELD.POSITION, position],
    [REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY, providerIdentity],
    [REVIEW_PAYLOAD_FIELD.URL, url],
  ]);
  if (!optional.ok) return forwardEvidenceRejection(optional);
  const lineValue = optionalFieldValue(line);
  const positionValue = optionalFieldValue(position);
  if (lineValue === undefined && positionValue === undefined) {
    return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.REVIEW_FINDING_ANCHOR);
  }
  const providerIdentityValue = optionalFieldValue(providerIdentity);
  const urlValue = optionalFieldValue(url);
  return acceptEvidence({
    path: required.value[REVIEW_PAYLOAD_FIELD.PATH],
    side,
    originalCommit: required.value[REVIEW_PAYLOAD_FIELD.ORIGINAL_COMMIT],
    diffHunk: required.value[REVIEW_PAYLOAD_FIELD.DIFF_HUNK],
    body: required.value[REVIEW_PAYLOAD_FIELD.BODY],
    finding: finding.value,
    ...(providerIdentityValue === undefined ? {} : { providerIdentity: providerIdentityValue }),
    ...(lineValue === undefined ? {} : { line: lineValue }),
    ...(positionValue === undefined ? {} : { position: positionValue }),
    ...(urlValue === undefined ? {} : { url: urlValue }),
  });
}

export function validateReviewScope(payload: JsonValue): EvidenceValidationResult<ReviewScopeUnit> {
  if (!isJsonRecord(payload)) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  const path = readRequiredString(payload, REVIEW_PAYLOAD_FIELD.PATH);
  if (path === undefined) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.PATH);
  const commit = readRequiredString(payload, REVIEW_PAYLOAD_FIELD.COMMIT);
  if (commit === undefined) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.COMMIT);
  const { side, coverageState } = payload;
  if (!isReviewAnchorSide(side)) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.SIDE);
  if (!isReviewScopeCoverageState(coverageState)) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.COVERAGE_STATE);
  const line = readOptionalPositiveInteger(payload, REVIEW_PAYLOAD_FIELD.LINE);
  if (line.state === OPTIONAL_FIELD_STATE.INVALID) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.LINE);
  const position = readOptionalPositiveInteger(payload, REVIEW_PAYLOAD_FIELD.POSITION);
  if (position.state === OPTIONAL_FIELD_STATE.INVALID) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.POSITION);
  const providerIdentity = readOptionalString(payload, REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY);
  if (providerIdentity.state === OPTIONAL_FIELD_STATE.INVALID) {
    return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY);
  }
  const url = readOptionalString(payload, REVIEW_PAYLOAD_FIELD.URL);
  if (url.state === OPTIONAL_FIELD_STATE.INVALID) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.URL);
  const lineValue = optionalFieldValue(line);
  const positionValue = optionalFieldValue(position);
  const providerIdentityValue = optionalFieldValue(providerIdentity);
  const urlValue = optionalFieldValue(url);
  return acceptEvidence({
    path,
    side,
    commit,
    coverageState,
    ...(providerIdentityValue === undefined ? {} : { providerIdentity: providerIdentityValue }),
    ...(lineValue === undefined ? {} : { line: lineValue }),
    ...(positionValue === undefined ? {} : { position: positionValue }),
    ...(urlValue === undefined ? {} : { url: urlValue }),
  });
}

export function validateReviewTerminalMetadata(payload: JsonValue): EvidenceValidationResult<ReviewTerminalMetadata> {
  if (!isJsonRecord(payload)) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  const actor = readRequiredString(payload, REVIEW_PAYLOAD_FIELD.ACTOR);
  if (actor === undefined) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.ACTOR);
  const body = readRequiredStringValue(payload, REVIEW_PAYLOAD_FIELD.BODY);
  if (body === undefined) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.BODY);
  const submittedAt = readRequiredString(payload, REVIEW_PAYLOAD_FIELD.SUBMITTED_AT);
  if (submittedAt === undefined) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.SUBMITTED_AT);
  const commit = readRequiredString(payload, REVIEW_PAYLOAD_FIELD.COMMIT);
  if (commit === undefined) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.COMMIT);
  const { state } = payload;
  if (!isReviewTerminalState(state)) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.STATE);
  const providerIdentity = readOptionalString(payload, REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY);
  if (providerIdentity.state === OPTIONAL_FIELD_STATE.INVALID) {
    return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.PROVIDER_IDENTITY);
  }
  const url = readOptionalString(payload, REVIEW_PAYLOAD_FIELD.URL);
  if (url.state === OPTIONAL_FIELD_STATE.INVALID) return rejectEvidenceField(REVIEW_PAYLOAD_FIELD.URL);
  const providerIdentityValue = optionalFieldValue(providerIdentity);
  const urlValue = optionalFieldValue(url);
  return acceptEvidence({
    actor,
    state,
    body,
    submittedAt,
    commit,
    ...(providerIdentityValue === undefined ? {} : { providerIdentity: providerIdentityValue }),
    ...(urlValue === undefined ? {} : { url: urlValue }),
  });
}

export function validateReviewTerminal(input: TerminalValidationInput): TerminalMetadataValidationResult {
  const metadata = input.metadata === undefined ? undefined : validateReviewTerminalMetadata(input.metadata);
  if (metadata !== undefined && !metadata.ok) return rejectTerminalMetadata(metadata.reason);
  const validated = metadata?.value;
  // A review run seals only with a status in the review vocabulary. The journal terminal statuses
  // `isVerifyTerminalStatus` admits but review never uses — `failed`, `interrupted`, and the
  // deterministic-runner status `passed` — never seal a review, even on a clean run whose evidence and
  // metadata compute no concrete expected status; any status outside the journal vocabulary is already
  // rejected upstream before this validator runs.
  if (!REVIEW_TERMINAL_STATUSES.has(input.terminalStatus)) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
      TERMINAL_REQUIREMENT.STATUS_IN_TYPE_VOCABULARY,
    );
  }
  const evidenceStatus = expectedReviewEvidenceTerminalStatus(input.events);
  const metadataStatus = expectedReviewMetadataTerminalStatus(validated);
  if (evidenceStatus !== undefined && metadataStatus !== undefined && evidenceStatus !== metadataStatus) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
      TERMINAL_REQUIREMENT.METADATA_MATCHES_EVIDENCE,
    );
  }
  const expectedStatus = evidenceStatus ?? metadataStatus;
  if (expectedStatus !== undefined && input.terminalStatus !== expectedStatus) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
      TERMINAL_REQUIREMENT.STATUS_MATCHES_EVIDENCE,
    );
  }
  if (validated === undefined) return { ok: true, value: undefined };
  return {
    ok: true,
    value: {
      actor: validated.actor,
      state: validated.state,
      body: validated.body,
      submittedAt: validated.submittedAt,
      commit: validated.commit,
      ...(validated.providerIdentity === undefined ? {} : { providerIdentity: validated.providerIdentity }),
      ...(validated.url === undefined ? {} : { url: validated.url }),
    },
  };
}

function validateAuditProducerIdentity(
  payload: JsonValue | undefined,
  ...path: readonly string[]
): EvidenceValidationResult<AuditProducerIdentity> {
  if (!isJsonRecord(payload)) return rejectEvidenceField(...path);
  const producerKind = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.PRODUCER_KIND);
  if (producerKind === undefined) return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.PRODUCER_KIND);
  const agentName = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.AGENT_NAME);
  if (agentName === undefined) return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.AGENT_NAME);
  const agentOwningPluginName = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.AGENT_OWNING_PLUGIN_NAME);
  if (agentOwningPluginName === undefined) {
    return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.AGENT_OWNING_PLUGIN_NAME);
  }
  const skillName = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.SKILL_NAME);
  if (skillName === undefined) return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.SKILL_NAME);
  const skillOwningPluginName = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.SKILL_OWNING_PLUGIN_NAME);
  if (skillOwningPluginName === undefined) {
    return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.SKILL_OWNING_PLUGIN_NAME);
  }
  const invocationRole = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.INVOCATION_ROLE);
  if (invocationRole === undefined) return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.INVOCATION_ROLE);
  return acceptEvidence({
    producerKind,
    agentName,
    agentOwningPluginName,
    skillName,
    skillOwningPluginName,
    invocationRole,
  });
}

function validateAuditProducerProvenance(
  payload: JsonValue | undefined,
  ...path: readonly string[]
): EvidenceValidationResult<AuditProducerProvenance> {
  if (!isJsonRecord(payload)) return rejectEvidenceField(...path);
  const agentOwningPluginVersion = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.AGENT_OWNING_PLUGIN_VERSION);
  if (agentOwningPluginVersion === undefined) {
    return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.AGENT_OWNING_PLUGIN_VERSION);
  }
  const skillOwningPluginVersion = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.SKILL_OWNING_PLUGIN_VERSION);
  if (skillOwningPluginVersion === undefined) {
    return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.SKILL_OWNING_PLUGIN_VERSION);
  }
  const toolVersion = readOptionalString(payload, AUDIT_PAYLOAD_FIELD.TOOL_VERSION);
  if (toolVersion.state === OPTIONAL_FIELD_STATE.INVALID) {
    return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.TOOL_VERSION);
  }
  const toolVersionValue = optionalFieldValue(toolVersion);
  return acceptEvidence({
    agentOwningPluginVersion,
    skillOwningPluginVersion,
    ...(toolVersionValue === undefined ? {} : { toolVersion: toolVersionValue }),
  });
}

function validateAuditPriorContextPartitions(
  payload: JsonValue | undefined,
  ...path: readonly string[]
): EvidenceValidationResult<AuditPriorContextPartitions> {
  if (!isJsonRecord(payload)) return rejectEvidenceField(...path);
  const changedFilePartition = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.CHANGED_FILE_PARTITION);
  if (changedFilePartition === undefined) {
    return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.CHANGED_FILE_PARTITION);
  }
  const concernPartition = readRequiredString(payload, AUDIT_PAYLOAD_FIELD.CONCERN_PARTITION);
  if (concernPartition === undefined) return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.CONCERN_PARTITION);
  const languagePartition = readOptionalString(payload, AUDIT_PAYLOAD_FIELD.LANGUAGE_PARTITION);
  if (languagePartition.state === OPTIONAL_FIELD_STATE.INVALID) {
    return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.LANGUAGE_PARTITION);
  }
  const languagePartitionValue = optionalFieldValue(languagePartition);
  return acceptEvidence({
    changedFilePartition,
    concernPartition,
    ...(languagePartitionValue === undefined ? {} : { languagePartition: languagePartitionValue }),
  });
}

function auditKindAllowsProducerProvenance(
  auditKind: AuditKind,
  producerProvenance: AuditProducerProvenance | undefined,
): boolean {
  return auditKind !== AUDIT_KIND.COVERAGE_GAP || producerProvenance === undefined;
}

function auditKindAllowsCoverageStatus(auditKind: AuditKind, coverageStatus: AuditCoverageStatus): boolean {
  return (
    auditKind !== AUDIT_KIND.COVERAGE_GAP
    || (
      coverageStatus !== AUDIT_COVERAGE_STATUS.AUDITED
      && coverageStatus !== AUDIT_COVERAGE_STATUS.NOT_APPLICABLE
    )
  );
}

/** An audit unit's typed vocabulary fields, once each is a member of its own closed registry. */
interface AuditScopeClassification {
  readonly auditClass: AuditClass;
  readonly auditKind: AuditKind;
  readonly coverageRequirement: AuditCoverageRequirement;
  readonly coverageStatus: AuditCoverageStatus;
}

/**
 * Read an audit unit's class, kind, coverage requirement, and coverage status, refusing the
 * first field outside its registry and then the two pairings the audit payload decision
 * constrains: kind against class, and a coverage-gap unit against a covered status.
 */
function readAuditScopeClassification(
  payload: { readonly [key: string]: JsonValue },
): EvidenceValidationResult<AuditScopeClassification> {
  const { auditClass, auditKind, coverageRequirement, coverageStatus } = payload;
  if (!isAuditClass(auditClass)) return rejectEvidenceField(AUDIT_PAYLOAD_FIELD.AUDIT_CLASS);
  if (!isAuditKind(auditKind)) return rejectEvidenceField(AUDIT_PAYLOAD_FIELD.AUDIT_KIND);
  if (!isCompatibleAuditKind(auditClass, auditKind)) {
    return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_KIND_MATCHES_CLASS);
  }
  if (!isAuditCoverageRequirement(coverageRequirement)) {
    return rejectEvidenceField(AUDIT_PAYLOAD_FIELD.COVERAGE_REQUIREMENT);
  }
  if (!isAuditCoverageStatus(coverageStatus)) return rejectEvidenceField(AUDIT_PAYLOAD_FIELD.COVERAGE_STATUS);
  if (!auditKindAllowsCoverageStatus(auditKind, coverageStatus)) {
    return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_COVERAGE_GAP_IS_UNCOVERED);
  }
  return acceptEvidence({ auditClass, auditKind, coverageRequirement, coverageStatus });
}

/** Validate an audit unit's producer provenance when the optional field is present. */
function readOptionalAuditProducerProvenance(
  field: OptionalField<{ readonly [key: string]: JsonValue }>,
): EvidenceValidationResult<AuditProducerProvenance | undefined> {
  if (field.state !== OPTIONAL_FIELD_STATE.PRESENT) return acceptEvidence(undefined);
  return validateAuditProducerProvenance(field.value, AUDIT_PAYLOAD_FIELD.PRODUCER_PROVENANCE);
}

export function validateAuditScope(payload: JsonValue): EvidenceValidationResult<AuditScopeUnit> {
  if (!isJsonRecord(payload)) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  const required = readRequiredStrings(payload, REQUIRED_AUDIT_SCOPE_STRING_FIELDS);
  if (!required.ok) return forwardEvidenceRejection(required);
  const unitId = required.value[AUDIT_PAYLOAD_FIELD.UNIT_ID];
  const subject = required.value[AUDIT_PAYLOAD_FIELD.SUBJECT];
  const classification = readAuditScopeClassification(payload);
  if (!classification.ok) return forwardEvidenceRejection(classification);
  const { auditClass, auditKind, coverageRequirement, coverageStatus } = classification.value;
  const priorContext = validateAuditPriorContextPartitions(
    readRequiredRecord(payload, AUDIT_PAYLOAD_FIELD.PRIOR_CONTEXT),
    AUDIT_PAYLOAD_FIELD.PRIOR_CONTEXT,
  );
  if (!priorContext.ok) return forwardEvidenceRejection(priorContext);
  const expectedProducer = validateAuditProducerIdentity(
    readRequiredRecord(payload, AUDIT_PAYLOAD_FIELD.EXPECTED_PRODUCER),
    AUDIT_PAYLOAD_FIELD.EXPECTED_PRODUCER,
  );
  if (!expectedProducer.ok) return forwardEvidenceRejection(expectedProducer);
  const recordedByRunDriver = validateAuditProducerIdentity(
    readRequiredRecord(payload, AUDIT_PAYLOAD_FIELD.RECORDED_BY_RUN_DRIVER),
    AUDIT_PAYLOAD_FIELD.RECORDED_BY_RUN_DRIVER,
  );
  if (!recordedByRunDriver.ok) return forwardEvidenceRejection(recordedByRunDriver);
  const parentUnitId = readOptionalString(payload, AUDIT_PAYLOAD_FIELD.PARENT_UNIT_ID);
  const producerProvenanceField = readOptionalRecord(payload, AUDIT_PAYLOAD_FIELD.PRODUCER_PROVENANCE);
  const optional = requireValidOptionalFields([
    [AUDIT_PAYLOAD_FIELD.PARENT_UNIT_ID, parentUnitId],
    [AUDIT_PAYLOAD_FIELD.PRODUCER_PROVENANCE, producerProvenanceField],
  ]);
  if (!optional.ok) return forwardEvidenceRejection(optional);
  const producerProvenance = readOptionalAuditProducerProvenance(producerProvenanceField);
  if (!producerProvenance.ok) return forwardEvidenceRejection(producerProvenance);
  const producerProvenanceValue = producerProvenance.value;
  const parentUnitIdValue = optionalFieldValue(parentUnitId);
  if (parentUnitIdValue === unitId) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_PARENT_IS_NOT_SELF);
  if (!auditKindAllowsProducerProvenance(auditKind, producerProvenanceValue)) {
    return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_COVERAGE_GAP_HAS_NO_PROVENANCE);
  }
  return acceptEvidence({
    unitId,
    auditClass,
    auditKind,
    subject,
    coverageRequirement,
    coverageStatus,
    priorContext: priorContext.value,
    expectedProducer: expectedProducer.value,
    recordedByRunDriver: recordedByRunDriver.value,
    ...(parentUnitIdValue === undefined ? {} : { parentUnitId: parentUnitIdValue }),
    ...(producerProvenanceValue === undefined ? {} : { producerProvenance: producerProvenanceValue }),
  });
}

function validateAuditFindingEvidence(
  evidence: { readonly [key: string]: JsonValue } | undefined,
  ...path: readonly string[]
): EvidenceValidationResult<AuditFinding["evidence"]> {
  if (evidence === undefined) return rejectEvidenceField(...path);
  const observed = readRequiredString(evidence, AUDIT_PAYLOAD_FIELD.OBSERVED);
  if (observed === undefined) return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.OBSERVED);
  const expected = readRequiredString(evidence, AUDIT_PAYLOAD_FIELD.EXPECTED);
  if (expected === undefined) return rejectEvidenceField(...path, AUDIT_PAYLOAD_FIELD.EXPECTED);
  return acceptEvidence({ observed, expected });
}

export function validateAuditFinding(payload: JsonValue): EvidenceValidationResult<AuditFinding> {
  if (!isJsonRecord(payload)) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  const required = readRequiredStrings(payload, REQUIRED_AUDIT_FINDING_STRING_FIELDS);
  if (!required.ok) return forwardEvidenceRejection(required);
  const { severity } = payload;
  if (!isAuditFindingSeverity(severity)) return rejectEvidenceField(AUDIT_PAYLOAD_FIELD.SEVERITY);
  const producerIdentity = validateAuditProducerIdentity(
    readRequiredRecord(payload, AUDIT_PAYLOAD_FIELD.PRODUCER_IDENTITY),
    AUDIT_PAYLOAD_FIELD.PRODUCER_IDENTITY,
  );
  if (!producerIdentity.ok) return forwardEvidenceRejection(producerIdentity);
  const producerProvenance = validateAuditProducerProvenance(
    readRequiredRecord(payload, AUDIT_PAYLOAD_FIELD.PRODUCER_PROVENANCE),
    AUDIT_PAYLOAD_FIELD.PRODUCER_PROVENANCE,
  );
  if (!producerProvenance.ok) return forwardEvidenceRejection(producerProvenance);
  const evidence = validateAuditFindingEvidence(
    readRequiredRecord(payload, AUDIT_PAYLOAD_FIELD.EVIDENCE),
    AUDIT_PAYLOAD_FIELD.EVIDENCE,
  );
  if (!evidence.ok) return forwardEvidenceRejection(evidence);
  return acceptEvidence({
    unitId: required.value[AUDIT_PAYLOAD_FIELD.UNIT_ID],
    producerIdentity: producerIdentity.value,
    producerProvenance: producerProvenance.value,
    rule: required.value[AUDIT_PAYLOAD_FIELD.RULE],
    severity,
    location: required.value[AUDIT_PAYLOAD_FIELD.LOCATION],
    message: required.value[AUDIT_PAYLOAD_FIELD.MESSAGE],
    evidence: evidence.value,
  });
}

export function auditFindingReferencesRecordedScope(
  events: readonly JournalEvent[],
  finding: AuditFinding,
): boolean {
  return events.some((event) => {
    if (event.type !== VERIFY_APPEND_EVENT_TYPE.SCOPE || !isJsonRecord(event.data)) return false;
    const scope = validateAuditScope(event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
    return scope.ok && scope.value.unitId === finding.unitId;
  });
}

function validateAuditFindingForRun(input: EvidenceValidationInput): EvidenceValidationResult<AuditFinding> {
  const finding = validateAuditFinding(input.payload);
  if (!finding.ok) return finding;
  return auditFindingReferencesRecordedScope(input.events, finding.value)
    ? finding
    : rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_FINDING_UNIT_IS_RECORDED);
}

/** One inspected test module recorded as `test` scope evidence, owned by the verify domain. */
export interface TestScopeUnit {
  readonly moduleId: string;
}

/** One failing test case recorded as a `test` finding, owned by the verify domain. */
export interface TestFinding {
  readonly moduleId: string;
  readonly testName: string;
  readonly errors: readonly string[];
}

/** Validate a `test` scope payload as one inspected test module. */
export function validateTestScope(payload: JsonValue): EvidenceValidationResult<TestScopeUnit> {
  if (!isJsonRecord(payload)) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  const moduleId = readRequiredString(payload, TEST_PAYLOAD_FIELD.MODULE_ID);
  if (moduleId === undefined) return rejectEvidenceField(TEST_PAYLOAD_FIELD.MODULE_ID);
  return acceptEvidence({ moduleId });
}

/** Validate a `test` finding payload as one failing test case with its error messages. */
export function validateTestFinding(payload: JsonValue): EvidenceValidationResult<TestFinding> {
  if (!isJsonRecord(payload)) return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  const moduleId = readRequiredString(payload, TEST_PAYLOAD_FIELD.MODULE_ID);
  if (moduleId === undefined) return rejectEvidenceField(TEST_PAYLOAD_FIELD.MODULE_ID);
  const testName = readRequiredString(payload, TEST_PAYLOAD_FIELD.TEST_NAME);
  if (testName === undefined) return rejectEvidenceField(TEST_PAYLOAD_FIELD.TEST_NAME);
  const errors = readFindingErrors(payload.errors);
  if (errors === undefined) return rejectEvidenceField(TEST_PAYLOAD_FIELD.ERRORS);
  return acceptEvidence({ moduleId, testName, errors });
}

/**
 * Read a `test` finding's error messages: an array of strings. The reporter maps a Vitest error with
 * no message to an empty string and a failing case with no error objects to an empty array, so the
 * validator accepts both — the finding's existence records the failure; the messages are diagnostic
 * detail.
 */
function readFindingErrors(value: JsonValue | undefined): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === "string") ? value : undefined;
}

/**
 * The terminal statuses a `test` run seals with — the runner-mapped subset of the journal
 * vocabulary. A deterministic test run never seals with an agentic disposition (`approved`,
 * `rejected`), so the terminal validator rejects those and any terminal metadata.
 */
const TEST_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  JOURNAL_RUN_STATE_STATUS.PASSED,
  JOURNAL_RUN_STATE_STATUS.FAILED,
  JOURNAL_RUN_STATE_STATUS.INTERRUPTED,
]);

/** Validate a `test` run's terminal completion: a runner-mapped status with no terminal metadata. */
export function validateTestTerminal(input: TerminalValidationInput): TerminalMetadataValidationResult {
  if (input.metadata !== undefined) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.METADATA_INVALID,
      TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED,
    );
  }
  if (!TEST_TERMINAL_STATUSES.has(input.terminalStatus)) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
      TERMINAL_REQUIREMENT.STATUS_IN_TYPE_VOCABULARY,
    );
  }
  // A passing deterministic run produces no findings, so `passed` never seals a run whose evidence
  // already records failures — the public recorder path never marks a run with findings as passing.
  if (input.terminalStatus === JOURNAL_RUN_STATE_STATUS.PASSED && countVerifyFindings(input.events) > 0) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
      TERMINAL_REQUIREMENT.PASSED_HAS_NO_FINDINGS,
    );
  }
  return { ok: true, value: undefined };
}

function auditScopeUnitsFromEvents(events: readonly JournalEvent[]): readonly AuditScopeUnit[] {
  return events.flatMap((event) => {
    if (event.type !== VERIFY_APPEND_EVENT_TYPE.SCOPE || !isJsonRecord(event.data)) return [];
    const scope = validateAuditScope(event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
    return scope.ok ? [scope.value] : [];
  });
}

function validateAuditScopeForRun(input: EvidenceValidationInput): EvidenceValidationResult<AuditScopeUnit> {
  const validated = validateAuditScope(input.payload);
  if (!validated.ok) return validated;
  const scope = validated.value;
  const recordedScopes = auditScopeUnitsFromEvents(input.events);
  if (recordedScopes.length === 0) {
    if (scope.parentUnitId !== undefined) {
      return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_FIRST_UNIT_IS_ROOT);
    }
    if (input.selector.scopeType !== VERIFY_SCOPE_TYPE.FILE) return validated;
    return scope.coverageRequirement === AUDIT_COVERAGE_REQUIREMENT.REQUIRED
        && scope.subject === input.selector.scopeIdentity
      ? validated
      : rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_FILE_ROOT_MATCHES_SCOPE);
  }
  if (scope.parentUnitId === undefined) {
    if (input.selector.scopeType === VERIFY_SCOPE_TYPE.FILE) {
      return rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_FILE_RUN_HAS_ONE_ROOT);
    }
    return recordedScopes.some((recordedScope) => recordedScope.parentUnitId !== undefined)
      ? rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_PARENT_IS_RECORDED)
      : validated;
  }
  return recordedScopes.some((recordedScope) => recordedScope.unitId === scope.parentUnitId)
    ? validated
    : rejectEvidenceRequirement(EVIDENCE_REQUIREMENT.AUDIT_PARENT_IS_RECORDED);
}

/**
 * The evidence-validator registry keyed by verification type and evidence kind. Dispatch is a
 * registry lookup, not verification-type-name branching; a new verification type registers
 * validators here.
 */
const EVIDENCE_VALIDATORS: Readonly<
  Record<
    VerifyVerificationType,
    Readonly<{
      readonly [VERIFY_EVIDENCE_KIND.SCOPE]: EvidenceValidator | undefined;
      readonly [VERIFY_EVIDENCE_KIND.FINDING]: EvidenceValidator | undefined;
      readonly [VERIFY_EVIDENCE_KIND.TERMINAL_METADATA]: TerminalMetadataValidator | undefined;
    }>
  >
> = {
  [VERIFY_VERIFICATION_TYPE.AUDIT]: {
    [VERIFY_EVIDENCE_KIND.SCOPE]: validateAuditScopeForRun,
    [VERIFY_EVIDENCE_KIND.FINDING]: validateAuditFindingForRun,
    [VERIFY_EVIDENCE_KIND.TERMINAL_METADATA]: validateAuditTerminal,
  },
  [VERIFY_VERIFICATION_TYPE.REVIEW]: {
    [VERIFY_EVIDENCE_KIND.SCOPE]: evidencePayloadValidator(validateReviewScope),
    [VERIFY_EVIDENCE_KIND.FINDING]: evidencePayloadValidator(validateReviewFinding),
    [VERIFY_EVIDENCE_KIND.TERMINAL_METADATA]: validateReviewTerminal,
  },
  [VERIFY_VERIFICATION_TYPE.TEST]: {
    [VERIFY_EVIDENCE_KIND.SCOPE]: evidencePayloadValidator(validateTestScope),
    [VERIFY_EVIDENCE_KIND.FINDING]: evidencePayloadValidator(validateTestFinding),
    [VERIFY_EVIDENCE_KIND.TERMINAL_METADATA]: validateTestTerminal,
  },
};

export function evidenceValidatorFor(
  verificationType: string,
  evidenceKind: typeof VERIFY_EVIDENCE_KIND.SCOPE | typeof VERIFY_EVIDENCE_KIND.FINDING,
): EvidenceValidator | undefined {
  return (
    EVIDENCE_VALIDATORS as Readonly<Record<string, typeof EVIDENCE_VALIDATORS[VerifyVerificationType] | undefined>>
  )[verificationType]?.[evidenceKind];
}

export function terminalMetadataValidatorFor(verificationType: string): TerminalMetadataValidator | undefined {
  return (
    EVIDENCE_VALIDATORS as Readonly<Record<string, typeof EVIDENCE_VALIDATORS[VerifyVerificationType] | undefined>>
  )[verificationType]?.[VERIFY_EVIDENCE_KIND.TERMINAL_METADATA];
}

function expectedReviewEvidenceTerminalStatus(events: readonly JournalEvent[]): string | undefined {
  if (countVerifyFindings(events) > 0 || countReviewScopeFindingUnits(events) > 0) {
    return JOURNAL_RUN_STATE_STATUS.REJECTED;
  }
  return undefined;
}

function auditCoverageRejectsRun(scope: AuditScopeUnit): boolean {
  if (scope.coverageRequirement !== AUDIT_COVERAGE_REQUIREMENT.REQUIRED) return false;
  return (
    scope.auditKind === AUDIT_KIND.COVERAGE_GAP
    || scope.coverageStatus === AUDIT_COVERAGE_STATUS.UNSUPPORTED
    || scope.coverageStatus === AUDIT_COVERAGE_STATUS.MISSING_SKILL
    || scope.coverageStatus === AUDIT_COVERAGE_STATUS.SKIPPED
    || scope.coverageStatus === AUDIT_COVERAGE_STATUS.INCOMPLETE
  );
}

function fileAuditRootMatchesSelector(
  scopes: readonly AuditScopeUnit[],
  selector: VerifyRunSelector,
): boolean {
  if (selector.scopeType !== VERIFY_SCOPE_TYPE.FILE) return true;
  const roots = scopes.filter(
    (scope) =>
      scope.parentUnitId === undefined
      && scope.coverageRequirement === AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
  );
  return roots.length === 1 && roots[0]?.subject === selector.scopeIdentity;
}

function expectedAuditTerminalStatus(input: TerminalValidationInput): string {
  const hasFinding = countVerifyFindings(input.events) > 0;
  const auditScopes = auditScopeUnitsFromEvents(input.events);
  const hasUncoveredRequiredScope = auditScopes.some(auditCoverageRejectsRun);
  return hasFinding
      || auditScopes.length === 0
      || hasUncoveredRequiredScope
      || !fileAuditRootMatchesSelector(auditScopes, input.selector)
    ? JOURNAL_RUN_STATE_STATUS.REJECTED
    : JOURNAL_RUN_STATE_STATUS.APPROVED;
}

export function validateAuditTerminal(input: TerminalValidationInput): TerminalMetadataValidationResult {
  if (input.metadata !== undefined) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.METADATA_INVALID,
      TERMINAL_REQUIREMENT.NO_METADATA_ACCEPTED,
    );
  }
  if (input.terminalStatus !== expectedAuditTerminalStatus(input)) {
    return rejectTerminal(
      TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT,
      TERMINAL_REQUIREMENT.STATUS_MATCHES_EVIDENCE,
    );
  }
  return { ok: true, value: undefined };
}

function expectedReviewMetadataTerminalStatus(metadata?: ReviewTerminalMetadata): string | undefined {
  if (metadata?.state === REVIEW_TERMINAL_STATE.APPROVED) return JOURNAL_RUN_STATE_STATUS.APPROVED;
  if (metadata?.state === REVIEW_TERMINAL_STATE.CHANGES_REQUESTED) return JOURNAL_RUN_STATE_STATUS.REJECTED;
  return undefined;
}

/**
 * Find the sequence of an already-appended event of this append kind bearing this idempotency key,
 * or `undefined` when none exists, so a repeated append returns the existing sequence instead of
 * duplicating evidence. The match is scoped by event type as well as key: an `append-scope` and an
 * `append-finding` never satisfy each other's idempotency check even when a caller reuses one key
 * across both verbs, matching the spec's "duplicating scope or finding evidence" per-kind contract.
 */
export function findAppendedSequence(
  events: readonly JournalEvent[],
  idempotencyKey: string,
  eventType: VerifyAppendEventType,
): number | undefined {
  const match = events.find(
    (event) =>
      event.type === eventType
      && isJsonRecord(event.data)
      && event.data[VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY] === idempotencyKey,
  );
  return match?.seq;
}

/** Build the append event input recording the caller idempotency key and the appended payload. */
export function buildAppendEvent(args: {
  readonly eventType: VerifyAppendEventType;
  readonly idempotencyKey: string;
  readonly payload: JsonValue;
  readonly at: Date;
}): JournalEventInput {
  return {
    id: args.idempotencyKey,
    source: VERIFY_EVENT_SOURCE,
    type: args.eventType,
    time: args.at.toISOString(),
    attempt: VERIFY_APPEND_ATTEMPT,
    data: {
      [VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY]: args.idempotencyKey,
      [VERIFY_APPEND_EVENT_FIELD.PAYLOAD]: args.payload,
    },
  };
}

/** The CloudEvents `type` the verify run-context event carries: the run-opening event recording drive mode. */
export const VERIFY_RUN_CONTEXT_EVENT_TYPE = `${RUNTIME_EVENT_NAMESPACE_DEFAULT}.verify.run-context` as const;

/** The `data` field the run-context event records: the run's drive mode. */
export const VERIFY_RUN_CONTEXT_EVENT_FIELD = {
  DRIVE_MODE: "driveMode",
} as const;

/** The id prefix the run-context event carries; with the run token it forms a stable per-run event id. */
export const VERIFY_RUN_CONTEXT_EVENT_ID_PREFIX = "verify-run-context-";

/** Build the run-context event input recording the run's drive mode at start. */
export function buildRunContextEvent(args: {
  readonly runToken: string;
  readonly driveMode: VerifyDriveMode;
  readonly at: Date;
}): JournalEventInput {
  return {
    id: `${VERIFY_RUN_CONTEXT_EVENT_ID_PREFIX}${args.runToken}`,
    source: VERIFY_EVENT_SOURCE,
    type: VERIFY_RUN_CONTEXT_EVENT_TYPE,
    time: args.at.toISOString(),
    attempt: VERIFY_APPEND_ATTEMPT,
    data: {
      [VERIFY_RUN_CONTEXT_EVENT_FIELD.DRIVE_MODE]: args.driveMode,
    },
  };
}

/** The CloudEvents `type` the verify terminal-completion event carries, distinguishing it from appends. */
export const VERIFY_TERMINAL_EVENT_TYPE = `${RUNTIME_EVENT_NAMESPACE_DEFAULT}.verify.terminal` as const;

/** The `data` field the terminal-completion event records: the run's terminal status. */
export const VERIFY_TERMINAL_EVENT_FIELD = {
  TERMINAL_METADATA: "terminalMetadata",
  TERMINAL_STATUS: "terminalStatus",
} as const;

/** The id prefix the terminal-completion event carries; with the run token it forms a stable per-run event id. Repeated-finish idempotency comes from the pre-append terminal-event check, not this id. */
export const VERIFY_TERMINAL_EVENT_ID_PREFIX = "verify-terminal-";

/**
 * Whether a value is a terminal status `finish` accepts. The terminal-status vocabulary is the
 * journal run-state vocabulary; verify validates against it rather than owning a second copy.
 */
export function isVerifyTerminalStatus(value: string): boolean {
  return isJournalRunStateStatus(value);
}

/** Build the terminal-completion event input recording the run's terminal status. */
export function buildTerminalEvent(args: {
  readonly runToken: string;
  readonly terminalStatus: string;
  readonly terminalMetadata?: JsonValue;
  readonly at: Date;
}): JournalEventInput {
  return {
    id: `${VERIFY_TERMINAL_EVENT_ID_PREFIX}${args.runToken}`,
    source: VERIFY_EVENT_SOURCE,
    type: VERIFY_TERMINAL_EVENT_TYPE,
    time: args.at.toISOString(),
    attempt: VERIFY_APPEND_ATTEMPT,
    data: {
      [VERIFY_TERMINAL_EVENT_FIELD.TERMINAL_STATUS]: args.terminalStatus,
      ...(args.terminalMetadata === undefined
        ? {}
        : { [VERIFY_TERMINAL_EVENT_FIELD.TERMINAL_METADATA]: args.terminalMetadata }),
    },
  };
}

/** The run's projected lifecycle state, folded from its journal event history. */
export interface VerifyRunProjection {
  readonly sealed: boolean;
  readonly driveMode: VerifyDriveMode;
  readonly terminalStatus?: string;
  readonly terminalMetadata?: JsonValue;
  readonly findingCount: number;
  readonly lastSequence: number;
  readonly nextActions: readonly string[];
  readonly auditScopeUnits: readonly AuditScopeUnit[];
}

/**
 * The run's drive mode folded from its run-context event. A run opened before drive mode was
 * recorded, or one whose run-context event is absent, folds to caller-driven — the mode under
 * which a caller appends its own evidence.
 */
export function driveModeOf(events: readonly JournalEvent[]): VerifyDriveMode {
  const runContext = events.find((event) => event.type === VERIFY_RUN_CONTEXT_EVENT_TYPE);
  if (runContext === undefined || !isJsonRecord(runContext.data)) return VERIFY_DRIVE_MODE.CALLER;
  const driveMode = runContext.data[VERIFY_RUN_CONTEXT_EVENT_FIELD.DRIVE_MODE];
  return typeof driveMode === "string" && isVerifyDriveMode(driveMode) ? driveMode : VERIFY_DRIVE_MODE.CALLER;
}

/** The last-sequence value a run with no events projects, one below the first assigned sequence. */
export const VERIFY_NO_EVENTS_SEQUENCE = 0;

/** The run's terminal-completion event, or `undefined` when the run is not finished. */
export function findTerminalEvent(
  events: readonly JournalEvent[],
): JournalEvent | undefined {
  return events.find((event) => event.type === VERIFY_TERMINAL_EVENT_TYPE);
}

function terminalStatusOf(event: JournalEvent | undefined): string | undefined {
  if (event === undefined || !isJsonRecord(event.data)) return undefined;
  const status = event.data[VERIFY_TERMINAL_EVENT_FIELD.TERMINAL_STATUS];
  return typeof status === "string" ? status : undefined;
}

function terminalMetadataOf(event: JournalEvent | undefined): JsonValue | undefined {
  if (event === undefined || !isJsonRecord(event.data)) return undefined;
  return event.data[VERIFY_TERMINAL_EVENT_FIELD.TERMINAL_METADATA];
}

/** The authoritative finding count from the event history: the number of recorded finding events. */
export function countVerifyFindings(events: readonly JournalEvent[]): number {
  return events.filter(
    (event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING,
  ).length;
}

function countReviewScopeFindingUnits(events: readonly JournalEvent[]): number {
  return events.filter((event) => {
    if (event.type !== VERIFY_APPEND_EVENT_TYPE.SCOPE || !isJsonRecord(event.data)) return false;
    const payload = event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD];
    const scope = validateReviewScope(payload);
    return scope.ok && scope.value.coverageState === REVIEW_SCOPE_COVERAGE_STATE.FINDING;
  }).length;
}

function lastSequenceOf(events: readonly JournalEvent[]): number {
  return events.reduce(
    (max, event) => (event.seq > max ? event.seq : max),
    VERIFY_NO_EVENTS_SEQUENCE,
  );
}

/**
 * Fold a run's journal event history into its projected lifecycle state. A run is sealed once it
 * carries a terminal-completion event; its terminal status, authoritative finding count, last
 * journal sequence, and remaining legal lifecycle actions all derive from the same history.
 */
export function projectVerifyRun(
  events: readonly JournalEvent[],
): VerifyRunProjection {
  const terminal = findTerminalEvent(events);
  const terminalStatus = terminalStatusOf(terminal);
  const terminalMetadata = terminalMetadataOf(terminal);
  const sealed = terminal !== undefined;
  const driveMode = driveModeOf(events);
  return {
    sealed,
    driveMode,
    ...(terminalStatus === undefined ? {} : { terminalStatus }),
    ...(terminalMetadata === undefined ? {} : { terminalMetadata }),
    findingCount: countVerifyFindings(events),
    lastSequence: lastSequenceOf(events),
    nextActions: sealed ? [] : unsealedNextActionsForDriveMode(driveMode),
    auditScopeUnits: auditScopeUnitsFromEvents(events),
  };
}
