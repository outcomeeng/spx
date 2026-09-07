import { execa } from "execa";

import { ReleasePublicationError } from "@/domains/release/publication";

export interface ReleasePublicationRunOptions {
  readonly cwd: string;
  readonly input?: string;
}

export interface ReleasePublicationRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type ReleasePublicationRunner = (
  command: string,
  args: readonly string[],
  options: ReleasePublicationRunOptions,
) => Promise<ReleasePublicationRunResult>;

const INCOMPLETE_RUN_REASON = "the subprocess produced no exit code";

/**
 * Runs one package-registry or repository-host command and reports its own exit code.
 * A command that could not be spawned or was terminated by a signal never completes, so it
 * has no exit code to report; that outcome fails the publication instead of resembling a
 * successful run.
 */
export const runReleasePublicationCommand: ReleasePublicationRunner = async (
  command,
  args,
  options,
) => {
  const result = await execa(command, [...args], {
    cwd: options.cwd,
    reject: false,
    ...(options.input === undefined ? {} : { input: options.input }),
  });
  if (result.exitCode === undefined) {
    throw new ReleasePublicationError(
      `${command} did not complete: ${incompleteRunReason(result.shortMessage)}`,
    );
  }
  return {
    exitCode: result.exitCode,
    stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
    stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
  };
};

function incompleteRunReason(shortMessage: unknown): string {
  return typeof shortMessage === "string" && shortMessage.length > 0
    ? shortMessage
    : INCOMPLETE_RUN_REASON;
}
