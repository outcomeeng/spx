/**
 * The handoff-base gate: resolves the git ref a handoff session records and
 * refuses a work context from which the recorded base would not be reachable
 * by a resuming agent.
 *
 * Pure over the supplied git facts — the handler gathers the facts via the
 * git primitives in `@/git/root` and the descriptor owns process I/O.
 *
 * @module domains/session/handoff-base
 */

import { SessionHandoffBaseError } from "./errors";

/**
 * Git facts the handoff-base gate evaluates. The handler gathers these via the
 * git primitives before calling {@link resolveHandoffGitRef}.
 */
export interface HandoffGitFacts {
  /** Whether `cwd` is the repository's root worktree (Git common-dir product root). */
  readonly isRootWorktree: boolean;
  /** The checked-out branch name, or null when HEAD is detached. */
  readonly branch: string | null;
  /** The HEAD commit SHA, or null when unavailable. */
  readonly headSha: string | null;
  /** Whether the working tree is clean. Only consulted for a linked, detached worktree. */
  readonly isClean: boolean;
  /** The commit SHA at the tip of `origin/<default>`, or null when unresolved. */
  readonly defaultTipSha: string | null;
}

/**
 * Resolves the git ref a handoff session records, enforcing the handoff-base
 * gate.
 *
 * - **Root worktree** (any HEAD): records the branch name when HEAD is on a
 *   branch, otherwise the HEAD commit SHA.
 * - **Linked worktree**: permitted only when detached, clean, and at the tip of
 *   `origin/<default>`, recording that SHA. An on-branch linked worktree is
 *   refused before the origin facts are consulted; a dirty or off-tip detached
 *   linked worktree is refused.
 *
 * @param facts - The git facts gathered by the handler.
 * @returns The git ref to record in the session frontmatter.
 * @throws {SessionHandoffBaseError} When the work context cannot anchor a base.
 */
export function resolveHandoffGitRef(facts: HandoffGitFacts): string {
  if (facts.isRootWorktree) {
    if (facts.branch !== null) return facts.branch;
    if (facts.headSha !== null) return facts.headSha;
    throw new SessionHandoffBaseError();
  }

  // Linked worktree: an on-branch worktree is refused without consulting origin.
  if (facts.branch !== null) {
    throw new SessionHandoffBaseError();
  }
  if (!facts.isClean) {
    throw new SessionHandoffBaseError();
  }
  if (
    facts.headSha === null
    || facts.defaultTipSha === null
    || facts.headSha !== facts.defaultTipSha
  ) {
    throw new SessionHandoffBaseError();
  }
  return facts.headSha;
}
