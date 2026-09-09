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
import { authoredText, externalValue, terminal, type TerminalText } from "@/lib/terminal-text/terminal-text";

export const WORKTREE_RESOLVE_ERROR = {
  AMBIGUOUS_WORKTREE_BASENAME: "ambiguous worktree basename",
  NOT_A_WORKTREE: "path resolves to no worktree",
  WORKTREE_LIST_UNAVAILABLE: "git worktree list is unavailable",
} as const;

/**
 * Why a target resolved to no worktree. The kind is what a caller branches on:
 * the diagnostic beside it is composed for a terminal and names the caller's own
 * target, so reading it back for a decision would both re-parse composed text and
 * break the moment the wording changed.
 */
export const WORKTREE_RESOLVE_ERROR_KIND = {
  AMBIGUOUS_BASENAME: "ambiguous-basename",
  NOT_A_WORKTREE: "not-a-worktree",
  WORKTREE_LIST_UNAVAILABLE: "worktree-list-unavailable",
} as const;

export type WorktreeResolveErrorKind = (typeof WORKTREE_RESOLVE_ERROR_KIND)[keyof typeof WORKTREE_RESOLVE_ERROR_KIND];

/** A resolution failure: the kind a caller branches on and the diagnostic it reports. */
export interface WorktreeResolveError {
  readonly kind: WorktreeResolveErrorKind;
  readonly text: TerminalText;
}

/**
 * A resolution failure naming the target it refused. The label is the product's
 * own; the target came from argv or the running directory, so it is escaped where
 * it is embedded.
 */
function resolveFailure(
  kind: WorktreeResolveErrorKind,
  label: string,
  target: string,
): { ok: false; error: WorktreeResolveError } {
  return {
    ok: false,
    error: { kind, text: terminal`${authoredText(label)}: ${externalValue(target)}` },
  };
}

/** A resolution failure the product states in full, naming no caller value. */
function resolveFailureWithoutTarget(
  kind: WorktreeResolveErrorKind,
  label: string,
): { ok: false; error: WorktreeResolveError } {
  return { ok: false, error: { kind, text: authoredText(label) } };
}

/** Receives a non-git-repo diagnostic for an interface boundary to surface. */
export type WorktreeWarningHandler = (warning: TerminalText | undefined) => void;

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
): Promise<Result<readonly ResolvedTargetWorktree[], WorktreeResolveError>> {
  const facts = await gatherGitFacts(options.cwd, options.gitDeps);
  if (facts === null) {
    return resolveFailure(
      WORKTREE_RESOLVE_ERROR_KIND.NOT_A_WORKTREE,
      WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE,
      options.cwd,
    );
  }
  if (!facts.worktreeListRead) {
    return resolveFailureWithoutTarget(
      WORKTREE_RESOLVE_ERROR_KIND.WORKTREE_LIST_UNAVAILABLE,
      WORKTREE_RESOLVE_ERROR.WORKTREE_LIST_UNAVAILABLE,
    );
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
): Promise<Result<ResolvedTargetWorktree, WorktreeResolveError>> {
  const base = options.cwd;
  const targetPath = options.worktree === undefined ? base : resolve(base, options.worktree);
  const targetGitPath = (await options.pathInfo.isExistingNonDirectory(targetPath)) ? dirname(targetPath) : targetPath;
  const worktree = await detectWorktreeProductRoot(targetGitPath, options.gitDeps);
  if (!worktree.isGitRepo) {
    const basenameTarget = await resolveBasenameTargetWorktree(options);
    if (basenameTarget.ok) return basenameTarget;
    return isBasenameFallbackResolutionError(basenameTarget.error.kind)
      ? basenameTarget
      : resolveFailure(
        WORKTREE_RESOLVE_ERROR_KIND.NOT_A_WORKTREE,
        WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE,
        options.worktree ?? base,
      );
  }
  return { ok: true, value: { name: worktreeClaimName(worktree.productDir), worktreeRoot: worktree.productDir } };
}

async function resolveBasenameTargetWorktree(
  options: WorktreeScopeOptions & { readonly worktree?: string },
): Promise<Result<ResolvedTargetWorktree, WorktreeResolveError>> {
  if (options.worktree === undefined || options.worktree !== basename(options.worktree)) {
    return resolveFailure(
      WORKTREE_RESOLVE_ERROR_KIND.NOT_A_WORKTREE,
      WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE,
      options.worktree ?? options.cwd,
    );
  }
  const facts = await gatherGitFacts(options.cwd, options.gitDeps);
  if (facts === null) {
    return resolveFailure(
      WORKTREE_RESOLVE_ERROR_KIND.NOT_A_WORKTREE,
      WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE,
      options.worktree,
    );
  }
  if (!facts.worktreeListRead) {
    return resolveFailureWithoutTarget(
      WORKTREE_RESOLVE_ERROR_KIND.WORKTREE_LIST_UNAVAILABLE,
      WORKTREE_RESOLVE_ERROR.WORKTREE_LIST_UNAVAILABLE,
    );
  }
  const matchingRoots = facts.worktreeRoots.filter((root) => basename(root) === options.worktree);
  if (matchingRoots.length === 0) {
    return resolveFailure(
      WORKTREE_RESOLVE_ERROR_KIND.NOT_A_WORKTREE,
      WORKTREE_RESOLVE_ERROR.NOT_A_WORKTREE,
      options.worktree,
    );
  }
  if (matchingRoots.length > 1) {
    return resolveFailure(
      WORKTREE_RESOLVE_ERROR_KIND.AMBIGUOUS_BASENAME,
      WORKTREE_RESOLVE_ERROR.AMBIGUOUS_WORKTREE_BASENAME,
      options.worktree,
    );
  }
  const [worktreeRoot] = matchingRoots;
  return { ok: true, value: { name: worktreeClaimName(worktreeRoot), worktreeRoot } };
}

function isBasenameFallbackResolutionError(kind: WorktreeResolveErrorKind): boolean {
  return kind === WORKTREE_RESOLVE_ERROR_KIND.WORKTREE_LIST_UNAVAILABLE
    || kind === WORKTREE_RESOLVE_ERROR_KIND.AMBIGUOUS_BASENAME;
}
