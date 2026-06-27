import { describe, expect, it } from "vitest";

import { type ExecResult, type GitDependencies } from "@/git/root";
import {
  BRANCH_CHECKOUT_FLAG,
  type CheckoutHookArgs,
  DEPS_INSTALL_GATE_EXIT_CODE,
  GIT_DIFF_SUCCESS_EXIT_CODE,
  LOCKFILE_NAME,
  resolveDepsInstallGateExitCode,
} from "@/lib/precommit/deps-install-gate";
import { PRECOMMIT_TEST_GENERATOR, samplePrecommitTestValue } from "@testing/generators/precommit/precommit";

interface GitInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

/** A dependency-injected git runner that records its invocations and replays a configured response. */
class RecordingGitRunner implements GitDependencies {
  readonly invocations: GitInvocation[] = [];

  constructor(private readonly respond: (args: readonly string[]) => Promise<ExecResult>) {}

  async execa(command: string, args: string[], options?: { cwd?: string; reject?: boolean }): Promise<ExecResult> {
    this.invocations.push({ command, args, cwd: options?.cwd });
    return this.respond(args);
  }
}

function execResult(stdout: string, exitCode: number = GIT_DIFF_SUCCESS_EXIT_CODE): ExecResult {
  return { exitCode, stdout, stderr: "" };
}

function runnerEmitting(stdout: string): RecordingGitRunner {
  return new RecordingGitRunner(() => Promise.resolve(execResult(stdout)));
}

describe("resolveDepsInstallGateExitCode", () => {
  const branchArgs: CheckoutHookArgs = {
    previousRef: samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.realCheckoutRef()),
    newRef: samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.realCheckoutRef()),
    branchFlag: BRANCH_CHECKOUT_FLAG,
  };
  const cwd = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.posixDirectoryPrefix());

  it("returns the install exit code when the lockfile-scoped diff lists the lockfile", async () => {
    const git = runnerEmitting(LOCKFILE_NAME);

    await expect(resolveDepsInstallGateExitCode(branchArgs, git, cwd)).resolves.toBe(
      DEPS_INSTALL_GATE_EXIT_CODE.INSTALL,
    );
  });

  it("returns the skip exit code when the lockfile-scoped diff is empty", async () => {
    const git = runnerEmitting("");

    await expect(resolveDepsInstallGateExitCode(branchArgs, git, cwd)).resolves.toBe(
      DEPS_INSTALL_GATE_EXIT_CODE.SKIP,
    );
  });

  it("returns the failure exit code when the lockfile-diff probe throws", async () => {
    const git = new RecordingGitRunner(() => Promise.reject(new Error("git diff failed")));

    await expect(resolveDepsInstallGateExitCode(branchArgs, git, cwd)).resolves.toBe(
      DEPS_INSTALL_GATE_EXIT_CODE.FAILURE,
    );
  });

  it("returns the failure exit code when the lockfile-diff probe resolves a non-zero exit code", async () => {
    const failingExitCode = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.exitCode());
    const git = new RecordingGitRunner(() => Promise.resolve(execResult("", failingExitCode)));

    await expect(resolveDepsInstallGateExitCode(branchArgs, git, cwd)).resolves.toBe(
      DEPS_INSTALL_GATE_EXIT_CODE.FAILURE,
    );
  });

  it("runs the lockfile-diff probe in the given working directory", async () => {
    const git = runnerEmitting(LOCKFILE_NAME);

    await resolveDepsInstallGateExitCode(branchArgs, git, cwd);

    expect(git.invocations).toHaveLength(1);
    expect(git.invocations[0]?.cwd).toBe(cwd);
  });
});
