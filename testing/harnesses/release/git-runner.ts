import { execa } from "execa";

import { withoutGitEnvironment } from "@/lib/git/environment";
import type { ExecResult, GitDependencies } from "@/lib/git/root";

/** One command the runner was asked to execute: the executable and its arguments, in order. */
export interface RecordedGitInvocation {
  readonly executable: string;
  readonly args: readonly string[];
}

/**
 * The git subcommands that reach a remote, per git's own documentation of its
 * remote-operation commands. Declared here, independently of any production
 * module, so evidence that release-data computation stays local rests on git's
 * contract rather than on the vocabulary the computation happens to use.
 */
export const GIT_REMOTE_SUBCOMMANDS = ["clone", "fetch", "pull", "push", "ls-remote", "remote", "submodule"] as const;

/**
 * A git runner for release-data evidence that delegates every command to the real
 * executable under a sanitized git environment while recording each invocation.
 * The record is an observation: the linked test decides what it means.
 */
export class RecordingReleaseGitRunner implements GitDependencies {
  readonly invocations: RecordedGitInvocation[] = [];

  async execa(
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean },
  ): Promise<ExecResult> {
    this.invocations.push({ executable: command, args: [...args] });
    const result = await execa(command, [...args], {
      cwd: options?.cwd,
      reject: options?.reject,
      env: withoutGitEnvironment(process.env),
      extendEnv: false,
    });
    if (result.exitCode === undefined) {
      throw new Error(`${command} ${args.join(" ")} did not complete: ${String(result.shortMessage)}`);
    }
    return {
      exitCode: result.exitCode,
      stdout: String(result.stdout),
      stderr: String(result.stderr),
    };
  }
}
