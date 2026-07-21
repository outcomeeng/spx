import type { SealedJournalRun } from "@/domains/journal/run-scope";
import {
  type FindingIdentityExtractor,
  foldRunSetRunEvidence,
  type MergePeriodIdentity,
  projectRunSet,
  type RunSetPriorContextSelector,
  type RunSetProjection,
  type RunSetRunEvidence,
  type RunSetSelector,
} from "@/domains/verify/run-set";
import type { VerifyScopeType } from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";

/**
 * The run-set address one persisted run resolves to, supplied by the caller that resolved the
 * merge period and merge-period-stable run-set scope key through its own injected capabilities.
 */
export interface RunSetRunAddress {
  readonly mergePeriod: MergePeriodIdentity;
  readonly verificationType: string;
  readonly scopeType: VerifyScopeType;
  readonly runSetScopeKey: string;
  readonly scopeIdentity: string;
}

export interface RunSetContextRequest {
  /** The injected journal read capability supplying the candidate persisted runs. */
  readonly readRuns: () => Promise<readonly SealedJournalRun[]>;
  readonly selector: RunSetSelector;
  /** Resolve one persisted run's run-set address; `undefined` excludes the run. */
  readonly runAddress: (run: SealedJournalRun) => RunSetRunAddress | undefined;
  readonly findingIdentity: FindingIdentityExtractor<JsonValue>;
  readonly scopeUnitKey: (unit: JsonValue) => string;
  readonly priorContext?: RunSetPriorContextSelector<JsonValue, JsonValue>;
}

/**
 * The internal verify-domain run-set context read projection: restore each persisted run's typed
 * evidence from its journal event history, then project the selected run set into producer
 * context. Agent harness workflows and backend delivery projections consume this projection
 * instead of parsing rendered comments, terminal output, or raw journal logs.
 */
export async function readRunSetContext(
  request: RunSetContextRequest,
): Promise<RunSetProjection<JsonValue, JsonValue>> {
  const runs = await request.readRuns();
  const evidence = runs.flatMap((run): readonly RunSetRunEvidence<JsonValue, JsonValue>[] => {
    const address = request.runAddress(run);
    if (address === undefined) return [];
    const folded = foldRunSetRunEvidence({
      verificationType: address.verificationType,
      selector: { scopeType: address.scopeType, scopeIdentity: address.scopeIdentity },
      events: run.events,
    });
    return [{
      mergePeriod: address.mergePeriod,
      verificationType: address.verificationType,
      scopeType: address.scopeType,
      runSetScopeKey: address.runSetScopeKey,
      runToken: run.runToken,
      scopeIdentity: address.scopeIdentity,
      recordedAt: run.metadata.startedAt,
      scopeUnits: folded.scopeUnits,
      findings: folded.findings,
    }];
  });
  return projectRunSet({
    runs: evidence,
    selector: request.selector,
    findingIdentity: request.findingIdentity,
    scopeUnitKey: request.scopeUnitKey,
    ...(request.priorContext === undefined ? {} : { priorContext: request.priorContext }),
  });
}
