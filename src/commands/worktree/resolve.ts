/**
 * Shared worktree-command resolution: the `.spx/worktrees` scope directory and
 * the running worktree's claim name.
 *
 * @module commands/worktree/resolve
 */

import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { detectWorktreeProductRoot, type GitDependencies } from "@/git/root";
import { resolveWorktreesScopeDir } from "@/lib/state-store";

export interface WorktreeScopeOptions {
  /** Working directory the resolution runs from. Defaults to the process cwd. */
  readonly cwd?: string;
  /** Explicit `.spx/worktrees` directory; bypasses git resolution when provided. */
  readonly worktreesDir?: string;
  /** Injected git runner for resolution. */
  readonly gitDeps?: GitDependencies;
}

/** The shared `.spx/worktrees` scope directory — the explicit override or the git-resolved root. */
export async function resolveWorktreesDir(options: WorktreeScopeOptions): Promise<string> {
  if (options.worktreesDir !== undefined) return options.worktreesDir;
  const resolved = await resolveWorktreesScopeDir({ cwd: options.cwd, deps: options.gitDeps });
  return resolved.worktreesDir;
}

/** The claim name for the worktree the command runs in. */
export async function resolveCurrentWorktreeName(options: WorktreeScopeOptions): Promise<string> {
  const worktree = await detectWorktreeProductRoot(options.cwd, options.gitDeps);
  return worktreeClaimName(worktree.productDir);
}
