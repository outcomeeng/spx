/**
 * The handoff-base gate: resolves the git ref a handoff session records and
 * refuses a work context from which the recorded base would not be reachable
 * by a resuming agent.
 *
 * Pure over the supplied git facts — the handler gathers the facts via the
 * git primitives in `@/lib/git/root` and the descriptor owns process I/O. A refused
 * non-main-checkout handoff throws {@link SessionHandoffBaseError} carrying the
 * resolved facts and the per-prerequisite evaluation; a non-git base throws it
 * marked `silent`, so the descriptor writes nothing; any other git refusal
 * (e.g. a main checkout with no reachable HEAD) carries no checklist and is not
 * silent, so the descriptor writes a plain diagnostic.
 *
 * @module domains/session/handoff-base
 */

import { SessionHandoffBaseError, SessionWorkBranchNotOnOriginError } from "./errors";
import {
  HANDOFF_BASE_PREREQUISITE_LABEL,
  HANDOFF_BASE_REMEDY,
  type HandoffBaseChecklist,
  type HandoffBasePrerequisite,
} from "./handoff-base-checklist";

/**
 * Git facts the handoff-base gate evaluates. The handler gathers these via the
 * git primitives before calling {@link resolveHandoffGitRef}. Every fact a
 * non-main-checkout refusal checklist renders is present, so the resolver
 * evaluates every prerequisite without re-reading git.
 */
export interface HandoffGitFacts {
  /** Whether `cwd` is inside a git repository at all. `false` → silent refusal. */
  readonly isGitRepo: boolean;
  /** Whether `cwd` is the repository's main checkout — the canonical working copy. */
  readonly isMainCheckout: boolean;
  /** The checked-out branch name, or null when HEAD is detached. */
  readonly branch: string | null;
  /** The HEAD commit SHA, or null when unavailable. */
  readonly headSha: string | null;
  /** Whether the working tree is clean. */
  readonly isClean: boolean;
  /** The resolved default branch name, or null when `origin/HEAD` is unset. */
  readonly defaultBranch: string | null;
  /** The commit SHA at the tip of `origin/<default>`, or null when unresolved. */
  readonly defaultTipSha: string | null;
  /** The absolute path of the worktree handoff runs from. */
  readonly currentWorktreePath: string;
  /** The absolute path of the repository's main checkout, or null when none is designable. */
  readonly mainCheckoutPath: string | null;
}

/**
 * The detached HEAD commit SHA when HEAD sits exactly at the resolved
 * `origin/<default>` tip, or null otherwise. Returning the SHA rather than a
 * boolean lets the caller record the permitted base without re-narrowing
 * `headSha`.
 */
function detachedDefaultTipSha(facts: HandoffGitFacts): string | null {
  const atTip = facts.branch === null
    && facts.headSha !== null
    && facts.defaultTipSha !== null
    && facts.headSha === facts.defaultTipSha;
  return atTip ? facts.headSha : null;
}

/** The clean-working-tree prerequisite, with its commit-before-handoff remedy when unmet. */
function cleanPrerequisite(facts: HandoffGitFacts): HandoffBasePrerequisite {
  return {
    label: HANDOFF_BASE_PREREQUISITE_LABEL.CLEAN_WORKING_TREE,
    met: facts.isClean,
    remedy: facts.isClean ? "" : HANDOFF_BASE_REMEDY.COMMIT_BEFORE_HANDOFF,
  };
}

/**
 * The detached-at-default-tip prerequisite. When unmet, the remedy is to detach
 * to the tip — but only when a tip SHA resolves; when `origin/<default>` resolves
 * to no commit the only remedy is to hand off from the main checkout, matching
 * the unresolved tip the fact line renders.
 */
function detachedAtTipPrerequisite(facts: HandoffGitFacts, met: boolean): HandoffBasePrerequisite {
  const remedy = facts.defaultTipSha === null
    ? HANDOFF_BASE_REMEDY.MAIN_CHECKOUT_ONLY
    : HANDOFF_BASE_REMEDY.DETACH_TO_TIP_OR_MAIN_CHECKOUT;
  return {
    label: HANDOFF_BASE_PREREQUISITE_LABEL.DETACHED_AT_DEFAULT_TIP,
    met,
    remedy: met ? "" : remedy,
  };
}

/** Assembles the refusal checklist from the resolved facts and prerequisites. */
function buildChecklist(
  facts: HandoffGitFacts,
  prerequisites: readonly HandoffBasePrerequisite[],
): HandoffBaseChecklist {
  return {
    defaultBranch: facts.defaultBranch,
    defaultTipSha: facts.defaultTipSha,
    headSha: facts.headSha,
    currentWorktreePath: facts.currentWorktreePath,
    mainCheckoutPath: facts.mainCheckoutPath,
    prerequisites,
  };
}

/**
 * Resolves the git ref a handoff session records, enforcing the handoff-base
 * gate.
 *
 * - **Non-git base**: throws a silent {@link SessionHandoffBaseError} (no checklist).
 * - **Main checkout** (any HEAD): records the branch name when HEAD is on a
 *   branch, otherwise the HEAD commit SHA; a main checkout with no reachable
 *   HEAD throws a non-silent diagnostic refusal (no checklist, `silent: false`),
 *   since only the non-git base refuses silently.
 * - **Non-main checkout**: every base prerequisite — a clean working tree and a
 *   HEAD detached at the `origin/<default>` tip — is evaluated regardless of the
 *   others. When all are met, records the tip SHA; otherwise throws a
 *   {@link SessionHandoffBaseError} carrying the checklist.
 *
 * @param facts - The git facts gathered by the handler.
 * @returns The git ref to record in the session frontmatter.
 * @throws {SessionHandoffBaseError} When the work context cannot anchor a base.
 */
export function resolveHandoffGitRef(facts: HandoffGitFacts): string {
  // A non-git base resolves no reachable commit and refuses silently.
  if (!facts.isGitRepo) {
    throw new SessionHandoffBaseError({ silent: true });
  }

  if (facts.isMainCheckout) {
    if (facts.branch !== null) return facts.branch;
    if (facts.headSha !== null) return facts.headSha;
    // A main checkout with no reachable HEAD is a git refusal, not the non-git
    // case — it carries a plain diagnostic rather than refusing silently.
    throw new SessionHandoffBaseError();
  }

  // Non-main checkout: evaluate every prerequisite so the checklist omits none.
  const tipSha = detachedDefaultTipSha(facts);
  const prerequisites: readonly HandoffBasePrerequisite[] = [
    cleanPrerequisite(facts),
    detachedAtTipPrerequisite(facts, tipSha !== null),
  ];

  if (facts.isClean && tipSha !== null) {
    return tipSha;
  }

  throw new SessionHandoffBaseError({ checklist: buildChecklist(facts, prerequisites) });
}

/**
 * Resolves the `git_ref` to record when the caller supplies an explicit
 * work-branch ref, enforcing that the branch exists on `origin`.
 *
 * Pure over the supplied facts — the handler performs the origin probe (via
 * `originBranchExists`) and passes its existence verdict here. The recorded ref
 * overrides the git-context base only after this verification; the handoff-base
 * gate that validates the running worktree is enforced separately by
 * {@link resolveHandoffGitRef} and is never bypassed by an explicit ref.
 *
 * @param workBranch - The caller-supplied work-branch ref.
 * @param existsOnOrigin - Whether `origin/<workBranch>` exists as an exact
 *   remote-tracking ref (from `git show-ref --verify --quiet`), which a revision
 *   expression like `<branch>~1` or the `HEAD` symref does not satisfy.
 * @returns The work-branch ref to record as `git_ref`.
 * @throws {SessionWorkBranchNotOnOriginError} When the branch is absent from `origin`.
 */
export function resolveWorkBranchGitRef(workBranch: string, existsOnOrigin: boolean): string {
  if (!existsOnOrigin) {
    throw new SessionWorkBranchNotOnOriginError(workBranch);
  }
  return workBranch;
}
