import type { TestRunnerDependencies } from "@/test/languages/types";
import type { CommandInvocation } from "@testing/generators/testing/recording-command-runner";

// The recording command runner each language test-harness provides: it captures the commands
// the runner constructs and returns a configured outcome. The structure is identical across
// language harnesses, kept parallel until a third language arrives, so this shared observation
// accepts any factory producing that shape.
export interface RecordingCommandRunner extends TestRunnerDependencies {
  readonly calls: readonly CommandInvocation[];
}

export type RecordingCommandRunnerFactory = (options: {
  readonly present: boolean;
  readonly exitCode: number;
}) => RecordingCommandRunner;

export interface RecordingCommandRunnerObservation {
  /** What the runner answered when asked whether its language is present. */
  readonly reportedPresence: boolean | undefined;
  /** The exit code each invocation returned, in invocation order. */
  readonly exitCodes: readonly number[];
  /** The calls the runner recorded after every invocation ran. */
  readonly calls: readonly CommandInvocation[];
}

// Drives one recording runner built by a language harness's factory through the supplied
// invocations and reports what it answered and recorded; the linked test owns every predicate.
export async function observeRecordingCommandRunner(
  createRunner: RecordingCommandRunnerFactory,
  options: {
    readonly present: boolean;
    readonly exitCode: number;
    readonly invocations: readonly CommandInvocation[];
  },
  productDir: string,
): Promise<RecordingCommandRunnerObservation> {
  const runner = createRunner({ present: options.present, exitCode: options.exitCode });
  const reportedPresence = runner.isLanguagePresent?.(productDir);
  const exitCodes: number[] = [];

  for (const { command, args } of options.invocations) {
    const result = await runner.runCommand(command, args);
    exitCodes.push(result.exitCode);
  }

  return { reportedPresence, exitCodes, calls: runner.calls };
}
