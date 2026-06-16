/**
 * Shared worktree-command resolution: the `.spx/worktrees` scope directory and
 * the running worktree's claim name.
 *
 * @module commands/worktree/resolve
 */

import { resolve } from "node:path";

import type { Result } from "@/config/types";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { detectWorktreeProductRoot, type GitDependencies } from "@/git/root";
import { resolveWorktreesScopeDir } from "@/lib/state-store";

export const WORKTREE_RESOLVE_ERROR = {
  NOT_A_WORKTREE: "path resolves to no worktree",
} as const;

/** Receives a non-git-repo diagnostic for the descriptor to surface to stderr. */
export type WorktreeWarningHandler = (warning: string | undefined) => void;

export interface WorktreeScopeOptions {
  /** Working directory the resolution runs from. Defaults to the process cwd. */
  readonly cwd?: string;
  /** Explicit `.spx/worktrees` directory; bypasses git resolution when provided. */
  readonly worktreesDir?: string;
  /** Injected git runner for resolution. */
  readonly gitDeps?: GitDependencies;
  /** Receives the non-git-repo diagnostic the shared-root resolution surfaces. */
  readonly onWarning?: WorktreeWarningHandler;
}

/** The shared `.spx/worktrees` scope directory — the explicit override or the git-resolved root. */
export async function resolveWorktreesDir(options: WorktreeScopeOptions): Promise<string> {
  if (options.worktreesDir !== undefined) return options.worktreesDir;
  const resolved = await resolveWorktreesScopeDir({ cwd: options.cwd, deps: options.gitDeps });
  options.onWarning?.(resolved.warning);
  return resolved.worktreesDir;
}

/** The claim name for the worktree the command runs in. */
export async function resolveCurrentWorktreeName(options: WorktreeScopeOptions): Promise<string> {
  const worktree = await detectWorktreeProductRoot(options.cwd, options.gitDeps);
  return worktreeClaimName(worktree.productDir);
}

/**
 * The claim name for the worktree a status target denotes. The target is the
 * `worktree` path resolved against the running directory, or the running
 * directory itself when omitted; its worktree root is resolved through the same
 * git resolution claim and release use, so any path inside a worktree — the
 * root, `.`, or a path within — keys the same claim. A target that resolves to
 * no worktree is refused rather than keyed on a bare path segment.
 */
export async function resolveTargetWorktreeName(
  options: WorktreeScopeOptions & { readonly worktree?: string },
): Promise<Result<string>> {
  const base = options.cwd ?? process.cwd();
  const targetPath = options.worktree === undefined ? base : resolve(base, options.worktree);
  const worktree = await detectWorktreeProductRoot(targetPath, options.gitDeps);
  if (!worktree.isGitRepo) {
    return { ok: false, error: `${WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE}: ${options.worktree ?? base}` };
  }
  return { ok: true, value: worktreeClaimName(worktree.productDir) };
}
