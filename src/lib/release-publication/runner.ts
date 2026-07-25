import { execa } from "execa";

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
  return {
    exitCode: result.exitCode ?? 0,
    stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
    stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
  };
};
