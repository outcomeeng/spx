import {
  evidenceValidatorFor,
  findTerminalEvent,
  VERIFY_APPEND_EVENT_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_EVIDENCE_KIND,
  VERIFY_TERMINAL_EVENT_FIELD,
  type VerifyRunSelector,
  type VerifyScopeType,
} from "@/domains/verify/verify";
import type { JournalEvent, JsonValue } from "@/lib/agent-run-journal";

/**
 * The backend kinds a merge period is keyed by. A merge period is the span over which repeated
 * verification runs converge before the change reaches its base: a local branch's life for the
 * local backend, a pull request's life for the pull-request backend.
 */
export const MERGE_PERIOD_BACKEND = {
  LOCAL: "local",
  PULL_REQUEST: "pull-request",
} as const;

export type MergePeriodBackend = (typeof MERGE_PERIOD_BACKEND)[keyof typeof MERGE_PERIOD_BACKEND];

/** A local merge period, keyed by the branch identity carrying the change. */
export interface LocalMergePeriod {
  readonly backend: typeof MERGE_PERIOD_BACKEND.LOCAL;
  readonly branch: string;
}

/** A pull-request merge period, keyed by the hosted pull request carrying the change. */
export interface PullRequestMergePeriod {
  readonly backend: typeof MERGE_PERIOD_BACKEND.PULL_REQUEST;
  readonly provider: string;
  readonly repository: string;
  readonly pullRequestNumber: number;
}

export type MergePeriodIdentity = LocalMergePeriod | PullRequestMergePeriod;

/** The canonical comparison key of a merge-period identity. */
export function mergePeriodKey(identity: MergePeriodIdentity): string {
  if (identity.backend === MERGE_PERIOD_BACKEND.LOCAL) {
    return JSON.stringify([identity.backend, identity.branch]);
  }
  return JSON.stringify([identity.backend, identity.provider, identity.repository, identity.pullRequestNumber]);
}

/**
 * The address of one verification run set: every run recorded for the same merge period,
 * verification type, scope type, and merge-period-stable run-set scope key belongs to one set,
 * whatever each run's own scope identity was.
 */
export interface RunSetSelector {
  readonly mergePeriod: MergePeriodIdentity;
  readonly verificationType: string;
  readonly scopeType: VerifyScopeType;
  readonly runSetScopeKey: string;
}

/**
 * One run's evidence inside a run set: the run-set address it was recorded under, its own scope
 * identity preserved as run evidence, and its typed scope and finding evidence.
 */
export interface RunSetRunEvidence<TScope, TFinding> {
  readonly mergePeriod: MergePeriodIdentity;
  readonly verificationType: string;
  readonly scopeType: VerifyScopeType;
  readonly runSetScopeKey: string;
  readonly runToken: string;
  readonly scopeIdentity: string;
  readonly recordedAt: string;
  readonly scopeUnits: readonly TScope[];
  readonly findings: readonly TFinding[];
}

/** The runs a selector addresses, split into prior runs and the current run with its scope. */
export interface RunSetSelection<TScope, TFinding> {
  readonly priorRuns: readonly RunSetRunEvidence<TScope, TFinding>[];
  readonly currentRun: RunSetRunEvidence<TScope, TFinding> | undefined;
  readonly currentScope: readonly TScope[];
}

function runSetAddressKey(address: {
  readonly mergePeriod: MergePeriodIdentity;
  readonly verificationType: string;
  readonly scopeType: VerifyScopeType;
  readonly runSetScopeKey: string;
}): string {
  return JSON.stringify([
    mergePeriodKey(address.mergePeriod),
    address.verificationType,
    address.scopeType,
    address.runSetScopeKey,
  ]);
}

function byRecordedOrder<TScope, TFinding>(
  left: RunSetRunEvidence<TScope, TFinding>,
  right: RunSetRunEvidence<TScope, TFinding>,
): number {
  if (left.recordedAt !== right.recordedAt) return left.recordedAt < right.recordedAt ? -1 : 1;
  if (left.runToken === right.runToken) return 0;
  return left.runToken < right.runToken ? -1 : 1;
}

/**
 * Select the run set a selector addresses: member runs share the selector's full address, order by
 * recording time, and the latest recorded member is the current run. Each member keeps its own
 * scope identity as run evidence — run scope identity never partitions a merge period's runs.
 */
export function selectRunSet<TScope, TFinding>(
  runs: readonly RunSetRunEvidence<TScope, TFinding>[],
  selector: RunSetSelector,
): RunSetSelection<TScope, TFinding> {
  const selectorKey = runSetAddressKey(selector);
  const members = runs
    .filter((run) => runSetAddressKey(run) === selectorKey)
    .sort(byRecordedOrder);
  const currentRun = members.at(-1);
  return {
    priorRuns: members.slice(0, -1),
    currentRun,
    currentScope: currentRun?.scopeUnits ?? [],
  };
}

/**
 * The normalized fields a finding's stable identity is computed from. Line numbers, provider
 * record identifiers, and producer provenance are display metadata and never participate.
 */
export interface FindingIdentityFields {
  readonly verificationType: string;
  readonly stableActor?: string;
  readonly normalizedSubject: string;
  readonly rule: string;
  readonly fingerprint: string;
}

/** A verification-type-provided extractor mapping one finding to its identity fields. */
export type FindingIdentityExtractor<TFinding> = (finding: TFinding) => FindingIdentityFields;

/** The stable identity key of a finding: a deterministic function of the identity fields alone. */
export function findingIdentityKey(fields: FindingIdentityFields): string {
  return JSON.stringify([
    fields.verificationType,
    fields.stableActor ?? null,
    fields.normalizedSubject,
    fields.rule,
    fields.fingerprint,
  ]);
}

/**
 * A verification-type-provided prior-context selector. It may drop a prior run entirely by
 * returning `undefined` or narrow the run's evidence; the projection applies it before any
 * producer receives prior context.
 */
export type RunSetPriorContextSelector<TScope, TFinding> = (
  run: RunSetRunEvidence<TScope, TFinding>,
) => RunSetRunEvidence<TScope, TFinding> | undefined;

/** The backend-neutral run-set context a verification producer consumes. */
export interface RunSetProjection<TScope, TFinding> {
  readonly priorRuns: readonly RunSetRunEvidence<TScope, TFinding>[];
  readonly currentScope: readonly TScope[];
  readonly activeFindings: readonly TFinding[];
  readonly resolvedFindings: readonly TFinding[];
  readonly reopenedFindings: readonly TFinding[];
  readonly coverageGaps: readonly TScope[];
}

export interface RunSetProjectionInput<TScope, TFinding> {
  readonly runs: readonly RunSetRunEvidence<TScope, TFinding>[];
  readonly selector: RunSetSelector;
  readonly findingIdentity: FindingIdentityExtractor<TFinding>;
  readonly scopeUnitKey: (unit: TScope) => string;
  readonly priorContext?: RunSetPriorContextSelector<TScope, TFinding>;
}

/**
 * Deduplicate items by key: key order follows first appearance, and each key's representative is
 * its most recent occurrence, so evolving display metadata resolves to the latest recorded values.
 */
function occurrencesByKey<T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, T> {
  const byKey = new Map<string, T>();
  for (const item of items) {
    byKey.set(keyOf(item), item);
  }
  return byKey;
}

/**
 * Project one run set into producer context: prior runs filtered through the type-provided
 * selector, the current scope, active/resolved/reopened finding groups classified by stable
 * finding identity, and the coverage gaps prior runs covered that the current scope does not.
 * Resolved findings and coverage gaps keep first-appearance order while each identity's
 * representative object is its most recent prior occurrence.
 */
export function projectRunSet<TScope, TFinding>(
  input: RunSetProjectionInput<TScope, TFinding>,
): RunSetProjection<TScope, TFinding> {
  const selection = selectRunSet(input.runs, input.selector);
  const priorRuns = selection.priorRuns
    .map((run) => (input.priorContext === undefined ? run : input.priorContext(run)))
    .filter((run): run is RunSetRunEvidence<TScope, TFinding> => run !== undefined);
  const keyOf = (finding: TFinding): string => findingIdentityKey(input.findingIdentity(finding));

  const currentFindings = selection.currentRun?.findings ?? [];
  const currentKeys = new Set(currentFindings.map(keyOf));
  const priorFindings = priorRuns.flatMap((run) => run.findings);
  const priorByKey = occurrencesByKey(priorFindings, keyOf);
  const latestPriorKeys = new Set((priorRuns.at(-1)?.findings ?? []).map(keyOf));

  const reopenedFindings = currentFindings.filter((finding) => {
    const key = keyOf(finding);
    return priorByKey.has(key) && !latestPriorKeys.has(key);
  });
  const reopenedKeys = new Set(reopenedFindings.map(keyOf));
  const activeFindings = currentFindings.filter((finding) => !reopenedKeys.has(keyOf(finding)));
  const resolvedFindings = [...priorByKey.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, finding]) => finding);

  const currentScopeKeys = new Set(selection.currentScope.map(input.scopeUnitKey));
  const priorUnits = priorRuns.flatMap((run) => run.scopeUnits);
  const coverageGaps = [...occurrencesByKey(priorUnits, input.scopeUnitKey).entries()]
    .filter(([key]) => !currentScopeKeys.has(key))
    .map(([, unit]) => unit);

  return {
    priorRuns,
    currentScope: selection.currentScope,
    activeFindings,
    resolvedFindings,
    reopenedFindings,
    coverageGaps,
  };
}

/** One run's typed evidence restored from its journal event history. */
export interface RunSetFoldedEvidence {
  readonly scopeUnits: readonly JsonValue[];
  readonly findings: readonly JsonValue[];
  readonly sealed: boolean;
  readonly terminalStatus?: string;
}

function isJsonRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatedPayloads(
  events: readonly JournalEvent[],
  eventType: string,
  verificationType: string,
  evidenceKind: typeof VERIFY_EVIDENCE_KIND.SCOPE | typeof VERIFY_EVIDENCE_KIND.FINDING,
  selector: VerifyRunSelector,
): readonly JsonValue[] {
  const validator = evidenceValidatorFor(verificationType, evidenceKind);
  if (validator === undefined) return [];
  return events.flatMap((event, index) => {
    if (event.type !== eventType || !isJsonRecord(event.data)) return [];
    const payload = event.data[VERIFY_APPEND_EVENT_FIELD.PAYLOAD];
    // Validate against the events recorded strictly before this one — the same prefix the
    // append-time validation saw — so order-dependent validators accept what they accepted then.
    // The narrowed view derives from the reasoned result rather than a second check, so the
    // projection and the append boundary cannot drift apart; the reason itself has no reader here.
    return validator({ payload, events: events.slice(0, index), selector }).ok ? [payload] : [];
  });
}

/**
 * Restore one run's typed evidence from its event history through the verification type's
 * registered evidence validators. Only validated verify evidence payloads participate: rendered
 * output, foreign event types, and journal-envelope display fields never reach the restored
 * context, so prior-run restoration cannot depend on parsing them.
 */
export function foldRunSetRunEvidence(args: {
  readonly verificationType: string;
  readonly selector: VerifyRunSelector;
  readonly events: readonly JournalEvent[];
}): RunSetFoldedEvidence {
  const terminal = findTerminalEvent(args.events);
  const terminalStatus = isJsonRecord(terminal?.data)
    ? terminal.data[VERIFY_TERMINAL_EVENT_FIELD.TERMINAL_STATUS]
    : undefined;
  return {
    scopeUnits: validatedPayloads(
      args.events,
      VERIFY_APPEND_EVENT_TYPE.SCOPE,
      args.verificationType,
      VERIFY_EVIDENCE_KIND.SCOPE,
      args.selector,
    ),
    findings: validatedPayloads(
      args.events,
      VERIFY_APPEND_EVENT_TYPE.FINDING,
      args.verificationType,
      VERIFY_EVIDENCE_KIND.FINDING,
      args.selector,
    ),
    sealed: terminal !== undefined,
    ...(typeof terminalStatus === "string" ? { terminalStatus } : {}),
  };
}
