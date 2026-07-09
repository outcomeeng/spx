/**
 * Shared worktree resolution: the `.spx/worktrees` scope directory and the
 * running worktree's claim name.
 *
 * @module domains/worktree/resolve
 */

import { basename, dirname, resolve } from "node:path";

import type { Result } from "@/config/types";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { detectWorktreeProductRoot, gatherGitFacts, type GitDependencies } from "@/lib/git/root";
import { resolveWorktreesScopeDir } from "@/lib/state-store";

export const WORKTREE_RESOLVE_ERROR = {
  AMBIGUOUS_WORKTREE_BASENAME: "ambiguous worktree basename",
  NOT_A_WORKTREE: "path resolves to no worktree",
  WORKTREE_LIST_UNAVAILABLE: "git worktree list is unavailable",
} as const;

/** Receives a non-git-repo diagnostic for an interface boundary to surface. */
export type WorktreeWarningHandler = (warning: string | undefined) => void;

export interface WorktreePathInfo {
  isExistingNonDirectory(path: string): Promise<boolean>;
}

export interface WorktreeScopeOptions {
  /** Working directory the resolution runs from. */
  readonly cwd: string;
  /** Explicit `.spx/worktrees` directory; bypasses git resolution when provided. */
  readonly worktreesDir?: string;
  /** Injected git runner for resolution. */
  readonly gitDeps: GitDependencies;
  /** Receives the non-git-repo diagnostic the shared-root resolution surfaces. */
  readonly onWarning?: WorktreeWarningHandler;
}

/** The shared `.spx/worktrees` scope directory — the explicit override or the git-resolved root. */
export async function resolveWorktreesDir(options: WorktreeScopeOptions): Promise<string> {
  if (options.worktreesDir !== undefined) return resolve(options.cwd, options.worktreesDir);
  const resolved = await resolveWorktreesScopeDir({ cwd: options.cwd, deps: options.gitDeps });
  options.onWarning?.(resolved.warning);
  return resolved.worktreesDir;
}

/** The claim name for the worktree the command runs in. */
export async function resolveCurrentWorktreeName(options: WorktreeScopeOptions): Promise<string> {
  const worktree = await detectWorktreeProductRoot(options.cwd, options.gitDeps);
  return worktreeClaimName(worktree.productDir);
}

/** A status target's claim name and the worktree root both its name and its `.spx/worktrees` scope derive from. */
export interface ResolvedTargetWorktree {
  readonly name: string;
  readonly worktreeRoot: string;
}

/** Every git-observed worktree root for the repository containing `cwd`, in git's first-seen order. */
export async function resolveAllTargetWorktrees(
  options: WorktreeScopeOptions,
): Promise<Result<readonly ResolvedTargetWorktree[]>> {
  const facts = await gatherGitFacts(options.cwd, options.gitDeps);
  if (facts === null) {
    return { ok: false, error: `${WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE}: ${options.cwd}` };
  }
  if (!facts.worktreeListRead) {
    return { ok: false, error: WORKTREE_RESOLVE_ERROR.WORKTREE_LIST_UNAVAILABLE };
  }
  return {
    ok: true,
    value: facts.worktreeRoots.map((worktreeRoot) => ({
      name: worktreeClaimName(worktreeRoot),
      worktreeRoot,
    })),
  };
}

/**
 * The worktree a status target denotes. The target is the `worktree` path
 * resolved against the running directory, or the running directory itself when
 * omitted; its worktree root is resolved through the same git resolution claim
 * and release use, so any path inside a worktree — the root, `.`, or a path
 * within — names the same claim. The resolved root is returned so the claim
 * scope resolves from the same worktree the name does, never from the caller's
 * unrelated working directory. A target that resolves to no worktree is refused
 * rather than keyed on a bare path segment. A bare basename target falls back
 * to git's observed worktree list only after direct path resolution fails.
 */
export async function resolveTargetWorktree(
  options: WorktreeScopeOptions & { readonly pathInfo: WorktreePathInfo; readonly worktree?: string },
): Promise<Result<ResolvedTargetWorktree>> {
  const base = options.cwd;
  const targetPath = options.worktree === undefined ? base : resolve(base, options.worktree);
  const targetGitPath = (await options.pathInfo.isExistingNonDirectory(targetPath)) ? dirname(targetPath) : targetPath;
  const worktree = await detectWorktreeProductRoot(targetGitPath, options.gitDeps);
  if (!worktree.isGitRepo) {
    const basenameTarget = await resolveBasenameTargetWorktree(options);
    if (basenameTarget.ok) return basenameTarget;
    return isBasenameFallbackResolutionError(basenameTarget.error)
      ? basenameTarget
      : { ok: false, error: `${WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE}: ${options.worktree ?? base}` };
  }
  return { ok: true, value: { name: worktreeClaimName(worktree.productDir), worktreeRoot: worktree.productDir } };
}

async function resolveBasenameTargetWorktree(
  options: WorktreeScopeOptions & { readonly worktree?: string },
): Promise<Result<ResolvedTargetWorktree>> {
  if (options.worktree === undefined || options.worktree !== basename(options.worktree)) {
    return { ok: false, error: `${WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE}: ${options.worktree ?? options.cwd}` };
  }
  const facts = await gatherGitFacts(options.cwd, options.gitDeps);
  if (facts === null) {
    return { ok: false, error: `${WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE}: ${options.worktree}` };
  }
  if (!facts.worktreeListRead) return { ok: false, error: WORKTREE_RESOLVE_ERROR.WORKTREE_LIST_UNAVAILABLE };
  const matchingRoots = facts.worktreeRoots.filter((root) => basename(root) === options.worktree);
  if (matchingRoots.length === 0) {
    return { ok: false, error: `${WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE}: ${options.worktree}` };
  }
  if (matchingRoots.length > 1) {
    return { ok: false, error: `${WORKTREE_RESOLVE_ERROR.AMBIGUOUS_WORKTREE_BASENAME}: ${options.worktree}` };
  }
  const [worktreeRoot] = matchingRoots;
  return { ok: true, value: { name: worktreeClaimName(worktreeRoot), worktreeRoot } };
}

function isBasenameFallbackResolutionError(error: string): boolean {
  return error === WORKTREE_RESOLVE_ERROR.WORKTREE_LIST_UNAVAILABLE
    || error.startsWith(WORKTREE_RESOLVE_ERROR.AMBIGUOUS_WORKTREE_BASENAME);
}
