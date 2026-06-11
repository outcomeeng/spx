/**
 * The handoff-base refusal checklist: the resolved git facts and per-prerequisite
 * evaluation a linked-worktree refusal carries, plus the source-owned vocabulary
 * the descriptor renders. Pure over the carried facts — the handler resolves the
 * facts, the resolver attaches them to {@link SessionHandoffBaseError}, and the
 * descriptor writes the rendered text to standard error.
 *
 * @module domains/session/handoff-base-checklist
 */

/** The error name a handoff-base refusal carries and the checklist names. */
export const SESSION_HANDOFF_BASE_ERROR_NAME = "SessionHandoffBaseError";

/** Markers a checklist line carries for a met or unmet base prerequisite. */
export const HANDOFF_BASE_MARK = {
  MET: "✓",
  UNMET: "✗",
} as const;

/** The base prerequisites a linked-worktree handoff must satisfy. */
export const HANDOFF_BASE_PREREQUISITE_LABEL = {
  CLEAN_WORKING_TREE: "working tree is clean",
  DETACHED_AT_DEFAULT_TIP: "HEAD is detached at the default-branch tip",
} as const;

/** The non-stashing remedy each unmet prerequisite states. */
export const HANDOFF_BASE_REMEDY = {
  /** Unclean working tree: commit, or hand off from the main checkout. */
  COMMIT_OR_MAIN_CHECKOUT: "commit the changes, or run handoff from the main checkout",
  /** Off the default-branch tip: detach to it, or hand off from the main checkout. */
  DETACH_TO_TIP_OR_MAIN_CHECKOUT: "detach HEAD to the default-branch tip, or run handoff from the main checkout",
  /** Default branch unresolved: only the main checkout can anchor the base. */
  MAIN_CHECKOUT_ONLY: "run handoff from the main checkout",
} as const;

/**
 * Labels on the resolved-git-fact lines the checklist carries. `DEFAULT_TIP`
 * reads `origin tip` rather than `default-branch tip` so a fact-line lookup by
 * label never collides with the `DETACHED_AT_DEFAULT_TIP` prerequisite label.
 */
export const HANDOFF_BASE_FACT_LABEL = {
  DEFAULT_BRANCH: "default branch",
  DEFAULT_TIP: "origin tip",
  HEAD: "HEAD",
  CURRENT_WORKTREE: "current worktree",
  MAIN_CHECKOUT: "main checkout",
} as const;

/** Stated in place of a default branch or tip that does not resolve (`origin/HEAD` unset). */
export const HANDOFF_BASE_UNRESOLVED = "unresolved";

/**
 * A single base prerequisite a linked-worktree refusal evaluates. Every
 * prerequisite is represented regardless of which are met, so the rendered
 * checklist omits none.
 */
export interface HandoffBasePrerequisite {
  /** The prerequisite, from {@link HANDOFF_BASE_PREREQUISITE_LABEL}. */
  readonly label: string;
  /** Whether the working context satisfies the prerequisite. */
  readonly met: boolean;
  /** When unmet, the non-stashing remedy from {@link HANDOFF_BASE_REMEDY}; empty when met. */
  readonly remedy: string;
}

/**
 * The resolved git facts and per-prerequisite evaluation a linked-worktree
 * handoff refusal carries. `null` for `defaultBranch` or `defaultTipSha` marks
 * the value unresolved — `origin/HEAD` is unset — never a fabricated branch or
 * SHA and never the literal placeholder `origin/<default>`.
 */
export interface HandoffBaseChecklist {
  /** The resolved default branch name, or `null` when `origin/HEAD` is unset. */
  readonly defaultBranch: string | null;
  /** The `origin/<default>` tip commit SHA, or `null` when unresolved. */
  readonly defaultTipSha: string | null;
  /** The observed HEAD commit SHA, or `null` when unavailable. */
  readonly headSha: string | null;
  /** The absolute path of the worktree handoff ran from. */
  readonly currentWorktreePath: string;
  /** The absolute path of the repository's main checkout. */
  readonly mainCheckoutPath: string;
  /** Every base prerequisite, each marked met or unmet. */
  readonly prerequisites: readonly HandoffBasePrerequisite[];
}

/** Leading indent on every checklist body line. */
const CHECKLIST_INDENT = "  ";
/** Separator between an unmet prerequisite and its remedy. */
const REMEDY_SEPARATOR = " — ";
/** Opening line introducing the refusal and naming the error. */
const CHECKLIST_HEADER =
  `${SESSION_HANDOFF_BASE_ERROR_NAME}: cannot create a handoff session from this worktree — it is not the main checkout.`;

/** Renders one resolved-fact line, stating `unresolved` for an absent value. */
function renderFactLine(label: string, value: string | null): string {
  return `${CHECKLIST_INDENT}${label}: ${value ?? HANDOFF_BASE_UNRESOLVED}`;
}

/** Renders one prerequisite line — a mark, the label, and (when unmet) its remedy. */
function renderPrerequisiteLine(prerequisite: HandoffBasePrerequisite): string {
  const mark = prerequisite.met ? HANDOFF_BASE_MARK.MET : HANDOFF_BASE_MARK.UNMET;
  const base = `${CHECKLIST_INDENT}${mark} ${prerequisite.label}`;
  return prerequisite.met ? base : `${base}${REMEDY_SEPARATOR}${prerequisite.remedy}`;
}

/**
 * Renders a linked-worktree handoff refusal as the prerequisite checklist the
 * descriptor writes to standard error: the error name, the resolved git values
 * (default branch, origin tip SHA, observed HEAD SHA, current and main checkout
 * paths — each stated `unresolved` when absent), and every base prerequisite on
 * its own line marked met or unmet with a non-stashing remedy when unmet.
 *
 * @param checklist - The resolved facts and per-prerequisite evaluation the
 *   refusal carries.
 * @returns The multi-line diagnostic, without a trailing newline.
 */
export function renderHandoffBaseChecklist(checklist: HandoffBaseChecklist): string {
  return [
    CHECKLIST_HEADER,
    renderFactLine(HANDOFF_BASE_FACT_LABEL.DEFAULT_BRANCH, checklist.defaultBranch),
    renderFactLine(HANDOFF_BASE_FACT_LABEL.DEFAULT_TIP, checklist.defaultTipSha),
    renderFactLine(HANDOFF_BASE_FACT_LABEL.HEAD, checklist.headSha),
    renderFactLine(HANDOFF_BASE_FACT_LABEL.CURRENT_WORKTREE, checklist.currentWorktreePath),
    renderFactLine(HANDOFF_BASE_FACT_LABEL.MAIN_CHECKOUT, checklist.mainCheckoutPath),
    ...checklist.prerequisites.map(renderPrerequisiteLine),
  ].join("\n");
}
