import type { VerifyStatusReport } from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { JournalEvent } from "@/lib/agent-run-journal";
import type { StartedRepositoryRun, VerifyFinishRepository } from "@testing/harnesses/verify/repository";

/**
 * What one reconcile-then-finish attempt on a bound run produced, in the order it ran: the
 * reconciliation result `reconcile` reported, the journal events before `finish`, the `finish`
 * result, the journal events after it, and the run's status report afterwards.
 */
export interface FinishAttemptObservation {
  readonly reconciliation: CliCommandResult;
  readonly eventsBefore: readonly JournalEvent[];
  readonly finished: CliCommandResult;
  readonly eventsAfter: readonly JournalEvent[];
  readonly status: VerifyStatusReport;
}

/**
 * Reconcile `run`, read its journal, attempt `finish` with `terminalStatus`, then read the journal
 * and status again. Returns the observations and asserts nothing: the linked test decides what
 * each one means.
 */
export async function observeFinishAttempt(
  repository: VerifyFinishRepository,
  run: StartedRepositoryRun,
  terminalStatus: string,
): Promise<FinishAttemptObservation> {
  const reconciliation = await repository.reconcile(run);
  const eventsBefore = await repository.readEvents(run);
  const finished = await repository.finish(run, terminalStatus);
  const eventsAfter = await repository.readEvents(run);
  const status = JSON.parse((await repository.status(run)).output) as VerifyStatusReport;
  return { reconciliation, eventsBefore, finished, eventsAfter, status };
}
