import { execa } from "execa";

import { withoutGitEnvironment } from "@/lib/git/environment";
import type { ExecResult, GitDependencies } from "@/lib/git/root";

/**
 * A git runner for release-data evidence that delegates every command to the real
 * executable under a sanitized git environment while recording the executable each
 * command names. The record is an observation: the linked test decides what it means.
 */
export class RecordingReleaseGitRunner implements GitDependencies {
  readonly invokedExecutables: string[] = [];

  async execa(
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean },
  ): Promise<ExecResult> {
    this.invokedExecutables.push(command);
    const result = await execa(command, [...args], {
      cwd: options?.cwd,
      reject: options?.reject,
      env: withoutGitEnvironment(process.env),
      extendEnv: false,
    });
    return {
      exitCode: result.exitCode ?? 0,
      stdout: String(result.stdout),
      stderr: String(result.stderr),
    };
  }
}
