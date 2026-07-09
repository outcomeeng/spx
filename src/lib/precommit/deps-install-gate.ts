/**
 * Post-checkout dependency-install gate for lefthook's post-checkout hook.
 *
 * Decides whether a checkout that moved the worktree's HEAD should re-install
 * dependencies, so a worktree advanced to a new commit through `git switch`,
 * `git checkout`, or `git worktree add` carries dependencies matching the
 * checked-out lockfile. Exits {@link DEPS_INSTALL_GATE_EXIT_CODE.INSTALL} for a
 * branch-or-HEAD checkout whose lockfile changed and
 * {@link DEPS_INSTALL_GATE_EXIT_CODE.SKIP} otherwise. The install decision is a
 * pure function of explicit checkout facts; reading the git post-checkout
 * arguments and the lockfile-scoped diff is a thin probe, separated so the
 * decision verifies without a git repository — mirroring the fact-shaped
 * main-checkout gate.
 *
 * @module lib/precommit/deps-install-gate
 */

import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import { defaultGitDependencies, GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "./entrypoint";

/** Exit codes emitted by the post-checkout dependency-install gate. */
export const DEPS_INSTALL_GATE_EXIT_CODE = {
  /** The checkout changed the lockfile — install dependencies. */
  INSTALL: 0,
  /** The checkout left dependencies unchanged — skip the install. */
  SKIP: 78,
  /** The gate itself failed, so the hook reports the failure instead of installing. */
  FAILURE: 1,
} as const;

export type DepsInstallGateExitCode = (typeof DEPS_INSTALL_GATE_EXIT_CODE)[keyof typeof DEPS_INSTALL_GATE_EXIT_CODE];

/** Git's post-checkout third argument value for a branch-or-HEAD checkout; a file checkout passes "0". */
export const BRANCH_CHECKOUT_FLAG = "1";

/** The lockfile whose change across a checkout triggers a dependency install. */
export const LOCKFILE_NAME = "pnpm-lock.yaml";

/** git subcommand and flags for the lockfile-scoped name-only diff across a checkout range. */
const GIT_DIFF = "diff";
const GIT_NAME_ONLY = "--name-only";
const GIT_PATHSPEC_SEPARATOR = "--";
/** Exit code git emits for a successful `git diff`; any other value is a probe failure. */
export const GIT_DIFF_SUCCESS_EXIT_CODE = 0;
const GATE_FAILURE_MESSAGE = "Dependency-install gate failed:";

/** `process.argv` index where git's post-checkout arguments begin (after node and the script path). */
const POST_CHECKOUT_ARG_OFFSET = 2;

/** The facts that decide a post-checkout dependency install. */
export interface CheckoutFacts {
  /** True when git reports a branch-or-HEAD checkout rather than a file checkout. */
  readonly branchCheckout: boolean;
  /** True when `pnpm-lock.yaml` changed across the checkout range. */
  readonly lockfileChanged: boolean;
}

/**
 * Whether a git previous ref is null — an empty string or an all-zero object id
 * of any length. Git passes a null previous ref for a fresh worktree's first
 * checkout, which resolves to a changed lockfile so a newly added worktree installs.
 */
export function isNullCheckoutRef(ref: string): boolean {
  return /^0*$/.test(ref);
}

/**
 * Resolves checkout facts from the git post-checkout flag, previous ref, and the
 * lockfile-scoped diff. A null previous ref resolves to a changed lockfile;
 * otherwise the lockfile changed exactly when the lockfile-scoped diff is non-empty.
 */
export function resolveCheckoutFacts(
  previousRef: string,
  branchFlag: string,
  changedLockfilePaths: readonly string[],
): CheckoutFacts {
  return {
    branchCheckout: branchFlag === BRANCH_CHECKOUT_FLAG,
    lockfileChanged: isNullCheckoutRef(previousRef) || changedLockfilePaths.length > 0,
  };
}

/** Maps resolved checkout facts to the hook-facing gate exit code. */
export function depsInstallGateExitCode(facts: CheckoutFacts): DepsInstallGateExitCode {
  return facts.branchCheckout && facts.lockfileChanged
    ? DEPS_INSTALL_GATE_EXIT_CODE.INSTALL
    : DEPS_INSTALL_GATE_EXIT_CODE.SKIP;
}

/**
 * Thin probe: reads the lockfile-scoped diff across the checkout range, running
 * git in `cwd` through the injected git dependencies. A null previous ref
 * consults no diff — a fresh worktree's checkout has no range to compare and
 * resolves to a changed lockfile directly. A non-zero git exit is a probe
 * failure: it throws so the caller resolves the failure exit code rather than
 * reading the empty output as an unchanged lockfile.
 */
async function readChangedLockfilePaths(
  previousRef: string,
  newRef: string,
  deps: GitDependencies,
  cwd: string,
): Promise<readonly string[]> {
  if (isNullCheckoutRef(previousRef)) {
    return [];
  }
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_DIFF, GIT_NAME_ONLY, previousRef, newRef, GIT_PATHSPEC_SEPARATOR, LOCKFILE_NAME],
    { cwd, reject: false },
  );
  if (result.exitCode !== GIT_DIFF_SUCCESS_EXIT_CODE) {
    throw new Error(`${GIT_DIFF} ${GIT_NAME_ONLY} exited ${result.exitCode}: ${result.stderr}`);
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Git's post-checkout arguments: the previous HEAD ref, the new HEAD ref, and the branch-checkout flag. */
export interface CheckoutHookArgs {
  readonly previousRef: string;
  readonly newRef: string;
  readonly branchFlag: string;
}

/**
 * Resolves the gate exit code for a post-checkout event: runs the lockfile-diff
 * probe in `cwd` through the injected git dependencies, then maps the resolved
 * facts to the exit code. Returns {@link DEPS_INSTALL_GATE_EXIT_CODE.FAILURE} when
 * the probe errors, so a probe failure surfaces as a hook failure rather than a
 * silent skip or install.
 */
export async function resolveDepsInstallGateExitCode(
  args: CheckoutHookArgs,
  deps: GitDependencies = defaultGitDependencies,
  cwd: string = CONFIG_PROCESS_CWD.read(),
): Promise<DepsInstallGateExitCode> {
  try {
    const changedLockfilePaths = await readChangedLockfilePaths(args.previousRef, args.newRef, deps, cwd);
    return depsInstallGateExitCode(resolveCheckoutFacts(args.previousRef, args.branchFlag, changedLockfilePaths));
  } catch (error) {
    console.error(GATE_FAILURE_MESSAGE, error);
    return DEPS_INSTALL_GATE_EXIT_CODE.FAILURE;
  }
}

/** Reads git's post-checkout arguments and exits with the resolved gate code. */
async function main(): Promise<void> {
  const [previousRef = "", newRef = "", branchFlag = ""] = process.argv.slice(POST_CHECKOUT_ARG_OFFSET);
  process.exit(await resolveDepsInstallGateExitCode({ previousRef, newRef, branchFlag }));
}

const isDirectExecution = typeof import.meta.url === "string"
  && isDirectPrecommitEntrypoint(
    import.meta.url,
    process.argv[1],
    PRECOMMIT_ENTRYPOINT.DEPS_INSTALL_GATE,
  );

if (isDirectExecution) {
  await main();
}
