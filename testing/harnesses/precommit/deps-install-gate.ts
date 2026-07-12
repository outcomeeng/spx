import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type ExecResult, type GitDependencies } from "@/lib/git/root";
import {
  BRANCH_CHECKOUT_FLAG,
  type CheckoutFacts,
  type CheckoutHookArgs,
  DEPS_INSTALL_GATE_EXIT_CODE,
  depsInstallGateExitCode,
  GIT_DIFF_SUCCESS_EXIT_CODE,
  LOCKFILE_NAME,
  resolveCheckoutFacts,
  resolveDepsInstallGateExitCode,
} from "@/lib/precommit/deps-install-gate";
import { PRECOMMIT_TEST_GENERATOR, samplePrecommitTestValue } from "@testing/generators/precommit/precommit";

interface GitInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

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

function branchArgs(): CheckoutHookArgs {
  return {
    previousRef: samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.realCheckoutRef()),
    newRef: samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.realCheckoutRef()),
    branchFlag: BRANCH_CHECKOUT_FLAG,
  };
}

function cwd(): string {
  return samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.posixDirectoryPrefix());
}

export function assertBranchLockfileChangeInstalls(): void {
  const facts: CheckoutFacts = { branchCheckout: true, lockfileChanged: true };

  expect(depsInstallGateExitCode(facts)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.INSTALL);
}

export function assertFileCheckoutSkipsWhenLockfileChanged(): void {
  const facts: CheckoutFacts = { branchCheckout: false, lockfileChanged: true };

  expect(depsInstallGateExitCode(facts)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.SKIP);
}

export function assertUnchangedLockfileSkips(): void {
  const branchUnchanged: CheckoutFacts = { branchCheckout: true, lockfileChanged: false };
  const fileUnchanged: CheckoutFacts = { branchCheckout: false, lockfileChanged: false };

  expect(depsInstallGateExitCode(branchUnchanged)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.SKIP);
  expect(depsInstallGateExitCode(fileUnchanged)).toBe(DEPS_INSTALL_GATE_EXIT_CODE.SKIP);
}

export function assertBranchFlagMapping(): void {
  fc.assert(
    fc.property(
      PRECOMMIT_TEST_GENERATOR.realCheckoutRef(),
      PRECOMMIT_TEST_GENERATOR.nonBranchCheckoutFlag(),
      (previousRef, nonBranchFlag) => {
        expect(resolveCheckoutFacts(previousRef, BRANCH_CHECKOUT_FLAG, []).branchCheckout).toBe(true);
        expect(resolveCheckoutFacts(previousRef, nonBranchFlag, []).branchCheckout).toBe(false);
      },
    ),
  );
}

export function assertNullRefMapsToChangedLockfile(): void {
  fc.assert(
    fc.property(
      PRECOMMIT_TEST_GENERATOR.nullCheckoutRef(),
      PRECOMMIT_TEST_GENERATOR.fileList(),
      (nullPreviousRef, arbitraryDiff) => {
        expect(resolveCheckoutFacts(nullPreviousRef, BRANCH_CHECKOUT_FLAG, arbitraryDiff).lockfileChanged).toBe(true);
      },
    ),
  );
}

export function assertNullRefNonBranchCheckoutFacts(): void {
  fc.assert(
    fc.property(
      PRECOMMIT_TEST_GENERATOR.nullCheckoutRef(),
      PRECOMMIT_TEST_GENERATOR.nonBranchCheckoutFlag(),
      PRECOMMIT_TEST_GENERATOR.fileList(),
      (nullPreviousRef, nonBranchFlag, arbitraryDiff) => {
        expect(resolveCheckoutFacts(nullPreviousRef, nonBranchFlag, arbitraryDiff)).toEqual({
          branchCheckout: false,
          lockfileChanged: true,
        });
      },
    ),
  );
}

export function assertRealRefMapsToLockfileDiffPresence(): void {
  fc.assert(
    fc.property(PRECOMMIT_TEST_GENERATOR.realCheckoutRef(), (previousRef) => {
      expect(resolveCheckoutFacts(previousRef, BRANCH_CHECKOUT_FLAG, []).lockfileChanged).toBe(false);
      expect(resolveCheckoutFacts(previousRef, BRANCH_CHECKOUT_FLAG, [LOCKFILE_NAME]).lockfileChanged).toBe(true);
    }),
  );
}

export async function assertInstallExitCodeWhenDiffListsLockfile(): Promise<void> {
  await expect(resolveDepsInstallGateExitCode(branchArgs(), runnerEmitting(LOCKFILE_NAME), cwd())).resolves.toBe(
    DEPS_INSTALL_GATE_EXIT_CODE.INSTALL,
  );
}

export async function assertSkipExitCodeWhenDiffEmpty(): Promise<void> {
  await expect(resolveDepsInstallGateExitCode(branchArgs(), runnerEmitting(""), cwd())).resolves.toBe(
    DEPS_INSTALL_GATE_EXIT_CODE.SKIP,
  );
}

export async function assertFailureExitCodeWhenDiffProbeThrows(): Promise<void> {
  const git = new RecordingGitRunner(() => Promise.reject(new Error("git diff failed")));

  await expect(resolveDepsInstallGateExitCode(branchArgs(), git, cwd())).resolves.toBe(
    DEPS_INSTALL_GATE_EXIT_CODE.FAILURE,
  );
}

export async function assertFailureExitCodeWhenDiffProbeExitsNonZero(): Promise<void> {
  const failingExitCode = samplePrecommitTestValue(PRECOMMIT_TEST_GENERATOR.exitCode());
  const git = new RecordingGitRunner(() => Promise.resolve(execResult("", failingExitCode)));

  await expect(resolveDepsInstallGateExitCode(branchArgs(), git, cwd())).resolves.toBe(
    DEPS_INSTALL_GATE_EXIT_CODE.FAILURE,
  );
}

export async function assertDiffProbeUsesWorkingDirectory(): Promise<void> {
  const git = runnerEmitting(LOCKFILE_NAME);
  const expectedCwd = cwd();

  await resolveDepsInstallGateExitCode(branchArgs(), git, expectedCwd);

  expect(git.invocations).toHaveLength(1);
  expect(git.invocations[0]?.cwd).toBe(expectedCwd);
}

interface DepsInstallGateProbeMappingCase {
  readonly name: string;
  readonly assertion: () => Promise<void>;
}

const DEPS_INSTALL_GATE_PROBE_MAPPING_CASES: readonly DepsInstallGateProbeMappingCase[] = [
  {
    name: "returns the install exit code when the lockfile-scoped diff lists the lockfile",
    assertion: assertInstallExitCodeWhenDiffListsLockfile,
  },
  {
    name: "returns the skip exit code when the lockfile-scoped diff is empty",
    assertion: assertSkipExitCodeWhenDiffEmpty,
  },
  {
    name: "returns the failure exit code when the lockfile-diff probe throws",
    assertion: assertFailureExitCodeWhenDiffProbeThrows,
  },
  {
    name: "returns the failure exit code when the lockfile-diff probe resolves a non-zero exit code",
    assertion: assertFailureExitCodeWhenDiffProbeExitsNonZero,
  },
  {
    name: "runs the lockfile-diff probe in the given working directory",
    assertion: assertDiffProbeUsesWorkingDirectory,
  },
];

export function registerDepsInstallGateProbeMappings(): void {
  describe("resolveDepsInstallGateExitCode", () => {
    it.each(DEPS_INSTALL_GATE_PROBE_MAPPING_CASES)("$name", async ({ assertion }) => {
      await assertion();
    });
  });
}
