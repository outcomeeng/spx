/**
 * Session-environment case generators.
 *
 * Enumerate the finite domains the session-environment mappings range over and construct the
 * verdict, bucket, and reading each case yields. The construction law is the mapping the node's spec
 * states: an errored check is unknown; a running current worktree with identity is working; identity
 * without a running worktree is identity-only; a running worktree without identity is unknown; no
 * identity and no running worktree is a silent no-op when the claim-path signal is present and
 * not-applicable when it is absent.
 */
import {
  SESSION_ENVIRONMENT_VERDICT,
  type SessionEnvironmentReading,
  type SessionEnvironmentVerdict,
} from "@/domains/diagnose/checks/session-environment";
import { VERDICT_BUCKET, type VerdictBucket } from "@/domains/diagnose/types";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";

const BOOLEANS: readonly boolean[] = [false, true];

const BUCKET_OF_VERDICT: Readonly<Record<SessionEnvironmentVerdict, VerdictBucket>> = {
  [SESSION_ENVIRONMENT_VERDICT.WORKING]: VERDICT_BUCKET.HEALTHY,
  [SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY]: VERDICT_BUCKET.DEGRADED,
  [SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP]: VERDICT_BUCKET.BROKEN,
  [SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE]: VERDICT_BUCKET.NOT_APPLICABLE,
  [SESSION_ENVIRONMENT_VERDICT.UNKNOWN]: VERDICT_BUCKET.UNKNOWN,
};

export interface SessionEnvironmentReadingCase {
  readonly reading: SessionEnvironmentReading;
  readonly verdict: SessionEnvironmentVerdict;
  readonly bucket: VerdictBucket;
}

function expectedVerdict(reading: SessionEnvironmentReading): SessionEnvironmentVerdict {
  if (reading.errored) return SESSION_ENVIRONMENT_VERDICT.UNKNOWN;
  if (reading.sessionIdentity) {
    return reading.worktreeClaimed
      ? SESSION_ENVIRONMENT_VERDICT.WORKING
      : SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY;
  }
  if (reading.worktreeClaimed) return SESSION_ENVIRONMENT_VERDICT.UNKNOWN;
  return reading.hookPresent ? SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP : SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE;
}

/** Every combination of the four readings' booleans with the verdict and bucket the spec's mapping assigns it. */
export function sessionEnvironmentReadingCases(): readonly SessionEnvironmentReadingCase[] {
  return BOOLEANS.flatMap((errored) =>
    BOOLEANS.flatMap((hookPresent) =>
      BOOLEANS.flatMap((sessionIdentity) =>
        BOOLEANS.map((worktreeClaimed) => {
          const reading = { errored, hookPresent, sessionIdentity, worktreeClaimed };
          const verdict = expectedVerdict(reading);
          return { reading, verdict, bucket: BUCKET_OF_VERDICT[verdict] };
        })
      )
    )
  );
}

export interface SessionEnvironmentSnapshotCase {
  readonly status: typeof OCCUPANCY_STATUS.RUNNING | typeof OCCUPANCY_STATUS.FREE;
  readonly hookPresent: boolean;
  /** Whether the shell environment carries the agent session identity. */
  readonly shellIdentity: boolean;
  /** Whether the current worktree's claim carries a session id. */
  readonly claimCarriesIdentity: boolean;
  /** The reading the snapshot derivation yields: identity comes from the shell or from a running claim that carries one. */
  readonly expectedReading: SessionEnvironmentReading;
  readonly verdict: SessionEnvironmentVerdict;
  readonly bucket: VerdictBucket;
}

/** Every combination of the current worktree's occupancy and the identity sources, with its derived reading. */
export function sessionEnvironmentSnapshotCases(): readonly SessionEnvironmentSnapshotCase[] {
  return [OCCUPANCY_STATUS.RUNNING, OCCUPANCY_STATUS.FREE].flatMap((status) =>
    BOOLEANS.flatMap((hookPresent) =>
      BOOLEANS.flatMap((shellIdentity) =>
        BOOLEANS.map((claimCarriesIdentity) => {
          const worktreeClaimed = status === OCCUPANCY_STATUS.RUNNING;
          const expectedReading = {
            errored: false,
            hookPresent,
            sessionIdentity: shellIdentity || (worktreeClaimed && claimCarriesIdentity),
            worktreeClaimed,
          };
          const verdict = expectedVerdict(expectedReading);
          return {
            status,
            hookPresent,
            shellIdentity,
            claimCarriesIdentity,
            expectedReading,
            verdict,
            bucket: BUCKET_OF_VERDICT[verdict],
          };
        })
      )
    )
  );
}

export interface ProbeClaimMergeCase {
  readonly claimMatchesCurrentWorktree: boolean;
  readonly shellIdentity: boolean;
  /** The reading a live exported claim yields: it is merged only when its filename matches the current worktree. */
  readonly expectedReading: SessionEnvironmentReading;
}

/** Every combination of the exported claim's worktree and the shell identity. */
export function probeClaimMergeCases(): readonly ProbeClaimMergeCase[] {
  return BOOLEANS.flatMap((claimMatchesCurrentWorktree) =>
    BOOLEANS.map((shellIdentity) => ({
      claimMatchesCurrentWorktree,
      shellIdentity,
      expectedReading: {
        errored: false,
        hookPresent: true,
        sessionIdentity: shellIdentity || claimMatchesCurrentWorktree,
        worktreeClaimed: claimMatchesCurrentWorktree,
      },
    }))
  );
}
