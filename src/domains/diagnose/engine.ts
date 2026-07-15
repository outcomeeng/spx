/**
 * Diagnose engine — runs exactly the check set the effective facts name, in supplied
 * order, by dispatching each name to its registered check runner, then folds the
 * per-check buckets into the overall verdict. The check registry is injected, so
 * the orchestration verifies over controlled check runners without resolving any
 * real runtime surface.
 *
 * @module domains/diagnose/engine
 */

import type { Result } from "@/config/types";
import type { DiagnoseFacts } from "@/domains/diagnose/effective-facts";
import { foldOverallVerdict } from "@/domains/diagnose/fold";
import type { CheckName } from "@/domains/diagnose/manifest";
import type { CheckRecord, DiagnoseReport } from "@/domains/diagnose/types";

/** A check runner gathers its readings and classifies them from the effective facts. */
export type CheckRunner = (facts: DiagnoseFacts) => Promise<CheckRecord>;

/** The set of check runners the engine dispatches to, keyed by check name. */
export type CheckRegistry = Readonly<Partial<Record<CheckName, CheckRunner>>>;

/**
 * Runs the effective check set in order through the registry and folds the result.
 * A named check with no registered runner is reported as an error rather than
 * silently skipped.
 */
export async function runDiagnose(
  facts: DiagnoseFacts,
  registry: CheckRegistry,
): Promise<Result<DiagnoseReport>> {
  const checks: CheckRecord[] = [];
  for (const name of facts.checks) {
    const runner = registry[name];
    if (runner === undefined) {
      return { ok: false, error: `no runner registered for check: ${name}` };
    }
    checks.push(await runner(facts));
  }
  const overall = foldOverallVerdict(checks.map((check) => check.bucket));
  return { ok: true, value: { checks, overall } };
}
