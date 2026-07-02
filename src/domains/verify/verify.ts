import { join } from "node:path";

import { digestDescriptorSection } from "@/config/descriptor-digest";
import type { Result } from "@/config/types";
import type { JournalEvent, JournalEventInput, JsonValue } from "@/lib/agent-run-journal";
import { branchScopeDir, runsDir, validateScopeToken } from "@/lib/state-store";

export const VERIFY_SCOPE_TYPE = {
  CHANGESET: "changeset",
  WORKING_TREE: "working-tree",
} as const;

export type VerifyScopeType = (typeof VERIFY_SCOPE_TYPE)[keyof typeof VERIFY_SCOPE_TYPE];

export const VERIFY_VERB = {
  START: "start",
  INPUT: "input",
  APPEND_SCOPE: "append-scope",
  APPEND_FINDING: "append-finding",
} as const;

export type VerifyVerb = (typeof VERIFY_VERB)[keyof typeof VERIFY_VERB];

/**
 * The verification types whose finding payloads `spx verify append-finding` validates. Each
 * type registers a finding validator (see `FINDING_VALIDATORS`); dispatch is a registry lookup
 * keyed by this vocabulary, never verification-type-name branching.
 */
export const VERIFY_VERIFICATION_TYPE = {
  REVIEW: "review",
} as const;

export type VerifyVerificationType = (typeof VERIFY_VERIFICATION_TYPE)[keyof typeof VERIFY_VERIFICATION_TYPE];

/** The receiver-action classes a review finding carries, per the merge lifecycle's finding disposition. */
export const REVIEW_FINDING_DISPOSITION = {
  BLOCKING: "BLOCKING",
  DEBT: "DEBT",
} as const;

export type ReviewFindingDisposition = (typeof REVIEW_FINDING_DISPOSITION)[keyof typeof REVIEW_FINDING_DISPOSITION];

/**
 * A validated `review` verification finding: the receiver-action disposition and the finding
 * summary. `spx verify append-finding` validates this shape at the boundary so callers do not
 * carry review-specific schema validation outside SPX.
 */
export interface ReviewFinding {
  readonly disposition: ReviewFindingDisposition;
  readonly summary: string;
}

/** The CloudEvents `type` each append verb records, distinguishing inspected scope from findings. */
export const VERIFY_APPEND_EVENT_TYPE = {
  SCOPE: "io.spx.verify.scope",
  FINDING: "io.spx.verify.finding",
} as const;

export type VerifyAppendEventType = (typeof VERIFY_APPEND_EVENT_TYPE)[keyof typeof VERIFY_APPEND_EVENT_TYPE];

/** The CloudEvents `source` every `spx verify` append event carries. */
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
  if (separatorIndex < 0) return { ok: false, error: VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET };
  const base = scope.slice(0, separatorIndex);
  const head = scope.slice(separatorIndex + VERIFY_SCOPE_SEPARATOR.length);
  if (base.length === 0 || head.length === 0 || head.includes(VERIFY_SCOPE_SEPARATOR)) {
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
export function digestRunInput(source: string, content: string): Result<string> {
  const digest = digestDescriptorSection({ source, content }, VERIFY_INPUT_DIGEST_PATH);
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
  readonly source: string;
  readonly digest: string;
  readonly content: string;
}

/**
 * The run's storage namespace — the state-store runs directory
 * `.spx/branch/<branch-slug>/<type>/runs` its journal and input record persist under.
 */
export function verifyRunsDir(scope: Omit<VerifyRunScope, "runToken">): Result<string> {
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
    value: join(runs.value, `${VERIFY_INPUT_RECORD.PREFIX}${token.value}${VERIFY_INPUT_RECORD.SUFFIX}`),
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

function isJsonRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewFindingDisposition(value: JsonValue | undefined): value is ReviewFindingDisposition {
  return (Object.values(REVIEW_FINDING_DISPOSITION) as readonly string[]).includes(value as string);
}

/** A verification type's finding-payload validator: returns the typed finding, or `undefined` when invalid. */
export type FindingValidator = (payload: JsonValue) => ReviewFinding | undefined;

/**
 * Validate a `review` finding payload: it must be an object carrying a known receiver-action
 * disposition and a non-empty summary. Any other shape is rejected so callers do not carry
 * review-specific schema validation outside SPX.
 */
export function validateReviewFinding(payload: JsonValue): ReviewFinding | undefined {
  if (!isJsonRecord(payload)) return undefined;
  const { disposition, summary } = payload;
  if (!isReviewFindingDisposition(disposition)) return undefined;
  if (typeof summary !== "string" || summary.length === 0) return undefined;
  return { disposition, summary };
}

/**
 * The finding-validator registry keyed by verification type. Dispatch is a registry lookup, not
 * verification-type-name branching; a new verification type registers a validator here.
 */
const FINDING_VALIDATORS: Readonly<Record<VerifyVerificationType, FindingValidator>> = {
  [VERIFY_VERIFICATION_TYPE.REVIEW]: validateReviewFinding,
};

/** Look up the finding validator for a verification type, or `undefined` when the type registers none. */
export function findingValidatorFor(verificationType: string): FindingValidator | undefined {
  return (FINDING_VALIDATORS as Readonly<Record<string, FindingValidator | undefined>>)[verificationType];
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
