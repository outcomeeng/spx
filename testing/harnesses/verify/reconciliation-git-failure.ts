import { realpath } from "node:fs/promises";

import { type VerifyCliDeps, verifyReconcileCommand } from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import { parseChangesetScope } from "@/domains/verify/verify";
import { GIT_DIFF_COMMAND, GIT_FIND_COPIES_HARDER_FLAG } from "@/lib/git/name-status";
import {
  GIT_COMMIT_PEEL_SUFFIX,
  GIT_REV_PARSE_UNRESOLVED_EXIT_CODE,
  GIT_ROOT_COMMAND,
  type GitDependencies,
} from "@/lib/git/root";
import { defaultStateStoreFileSystem } from "@/lib/state-store";
import { createRecordingStreamSink } from "@testing/harnesses/verify/harness";
import {
  realVerifyGitDependencies,
  type StartedRepositoryRun,
  type VerifyFinishRepository,
} from "@testing/harnesses/verify/repository";

/**
 * The git failures a reconcile of a changeset run meets while deriving the inventory its selector
 * resolves to. Each simulates a failure real git raises only by damaging the object store, so the
 * controlled git dependency answers the named invocations and runs every other invocation for real.
 */
export const RECONCILE_GIT_FAILURE = {
  /** The inventory diff fails while both changeset revisions still resolve to commits. */
  INVENTORY_DIFF: "inventory-diff",
  /** The inventory diff fails and every revision lookup exits with a status that is not the unresolved status. */
  REVISION_LOOKUP_EXIT: "revision-lookup-exit",
  /** The inventory diff and every revision lookup fail to run git at all. */
  GIT_NOT_RUNNABLE: "git-not-runnable",
  /** The inventory diff fails and the changeset base names no commit. */
  BASE_NAMES_NO_COMMIT: "base-names-no-commit",
} as const;

export type ReconcileGitFailure = (typeof RECONCILE_GIT_FAILURE)[keyof typeof RECONCILE_GIT_FAILURE];

/** The failures that are not an unresolvable changeset selector. */
export const RECONCILE_NON_SELECTOR_GIT_FAILURES: readonly ReconcileGitFailure[] = [
  RECONCILE_GIT_FAILURE.INVENTORY_DIFF,
  RECONCILE_GIT_FAILURE.REVISION_LOOKUP_EXIT,
  RECONCILE_GIT_FAILURE.GIT_NOT_RUNNABLE,
];

const GIT_FATAL_EXIT_CODE = 128;

function isInventoryDiff(args: readonly string[]): boolean {
  return args[0] === GIT_DIFF_COMMAND && args.includes(GIT_FIND_COPIES_HARDER_FLAG);
}

function isRevisionLookup(args: readonly string[]): boolean {
  return args[0] === GIT_ROOT_COMMAND.REV_PARSE && (args.at(-1) ?? "").endsWith(GIT_COMMIT_PEEL_SUFFIX);
}

function revisionOf(args: readonly string[]): string {
  return (args.at(-1) ?? "").slice(0, -GIT_COMMIT_PEEL_SUFFIX.length);
}

/** Git that runs for real except for the invocations `failure` names, which fail with `gitError`. */
function gitFailingWith(
  real: GitDependencies,
  failure: ReconcileGitFailure,
  gitError: string,
  unresolvedBase: string,
): GitDependencies {
  const fatal = { exitCode: GIT_FATAL_EXIT_CODE, stdout: "", stderr: gitError };
  return {
    execa: async (command, args, options) => {
      if (isInventoryDiff(args)) {
        if (failure === RECONCILE_GIT_FAILURE.GIT_NOT_RUNNABLE) throw new Error(gitError);
        return fatal;
      }
      if (!isRevisionLookup(args)) return real.execa(command, args, options);
      if (failure === RECONCILE_GIT_FAILURE.GIT_NOT_RUNNABLE) throw new Error(gitError);
      if (failure === RECONCILE_GIT_FAILURE.REVISION_LOOKUP_EXIT) return fatal;
      if (failure === RECONCILE_GIT_FAILURE.BASE_NAMES_NO_COMMIT && revisionOf(args) === unresolvedBase) {
        return args.includes(GIT_ROOT_COMMAND.QUIET)
          ? { exitCode: GIT_REV_PARSE_UNRESOLVED_EXIT_CODE, stdout: "", stderr: "" }
          : fatal;
      }
      return real.execa(command, args, options);
    },
  };
}

/**
 * Reconcile a started changeset run through the production reconciliation operation while git
 * fails as `failure` names, with `gitError` as the text each failing invocation reports.
 */
export async function reconcileUnderGitFailure(
  repository: VerifyFinishRepository,
  run: StartedRepositoryRun,
  failure: ReconcileGitFailure,
  gitError: string,
): Promise<CliCommandResult> {
  if (run.runToken === undefined) {
    throw new Error(`reconcile git-failure harness: reconcile needs a started run: ${run.started.output}`);
  }
  const changeset = parseChangesetScope(run.scope);
  if (!changeset.ok) {
    throw new Error(`reconcile git-failure harness: the run scope is not a changeset: ${run.scope}`);
  }
  const deps: VerifyCliDeps = {
    cwd: await realpath(repository.productDir),
    git: gitFailingWith(realVerifyGitDependencies(), failure, gitError, changeset.value.base),
    processEnv: {},
    fs: defaultStateStoreFileSystem,
    readInputSource: async (source) => new TextEncoder().encode(source),
    journalBinding: { localSink: createRecordingStreamSink().sink },
  };
  return verifyReconcileCommand(
    {
      verificationType: run.verificationType,
      scopeType: run.scopeType,
      scope: run.scope,
      run: run.runToken,
    },
    deps,
  );
}
