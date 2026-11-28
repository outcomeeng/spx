import {
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  verifyFinishCommand,
  verifyStatusCommand,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseStatusReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyAppendOptions,
  type VerifyAppendScenarioEnv,
  verifyFinishOptions,
  verifyStatusOptions,
  withFileScope,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

/** A started caller-driven `probe` run over a file scope, on its own in-memory state store. */
export interface ProbeRunEnv extends VerifyAppendScenarioEnv {
  readonly runToken: string;
}

/** A lifecycle command's exit code and output, as the command returned them. */
export interface ProbeCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

let appendCount = 0;

/**
 * A key no earlier append of this harness used, so each append records a new event; the drawn key
 * stays the prefix, and a counter keeps repeated appends distinct.
 */
function nextIdempotencyKey(): string {
  appendCount += 1;
  return `${sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey())}-${appendCount}`;
}

/** Start a `probe` run whose file scope is `scopePath`. */
export async function startProbeRun(scopePath: string): Promise<ProbeRunEnv> {
  const env = createVerifyAppendScenario(
    withFileScope(withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.PROBE), scopePath),
  );
  const runToken = await startedRunToken(env.scenario, env.deps);
  return { ...env, runToken };
}

/** Start a `probe` run over a changeset scope, which no probe protocol can root. */
export async function startProbeChangesetRun(): Promise<ProbeRunEnv> {
  const env = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.PROBE),
  );
  const runToken = await startedRunToken(env.scenario, env.deps);
  return { ...env, runToken };
}

/** Record one payload as `probe` scope evidence through `scope add`. */
export function addProbeScope(env: ProbeRunEnv, payload: unknown): Promise<ProbeCommandResult> {
  return verifyAppendScopeCommand(
    verifyAppendOptions(env.scenario, {
      run: env.runToken,
      payload: JSON.stringify(payload),
      idempotencyKey: nextIdempotencyKey(),
    }),
    env.deps,
  );
}

/** Record one payload as a `probe` finding through `finding add`. */
export function addProbeFinding(env: ProbeRunEnv, payload: unknown): Promise<ProbeCommandResult> {
  return verifyAppendFindingCommand(
    verifyAppendOptions(env.scenario, {
      run: env.runToken,
      payload: JSON.stringify(payload),
      idempotencyKey: nextIdempotencyKey(),
    }),
    env.deps,
  );
}

/** Finish the run with a terminal status and, when given, terminal metadata. */
export function finishProbeRun(
  env: ProbeRunEnv,
  terminalStatus: string,
  terminalMetadata?: unknown,
): Promise<ProbeCommandResult> {
  return verifyFinishCommand(
    {
      ...verifyFinishOptions(env.scenario, { run: env.runToken, terminalStatus }),
      ...(terminalMetadata === undefined ? {} : { terminalMetadata: JSON.stringify(terminalMetadata) }),
    },
    env.deps,
  );
}

/** The run's projected status, read through `status`. */
export async function probeRunStatus(env: ProbeRunEnv): Promise<VerifyStatusReport> {
  const result = await verifyStatusCommand(verifyStatusOptions(env.scenario, env.runToken), env.deps);
  return parseStatusReport(result.output);
}

/** Every event the run's journal holds. */
export function probeRunEvents(env: ProbeRunEnv): Promise<readonly JournalEvent[]> {
  return readVerifyRunEvents(env.scenario, env.runToken, env.fs);
}
