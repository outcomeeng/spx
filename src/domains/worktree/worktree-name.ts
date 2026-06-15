/**
 * Worktree claim-name derivation — the `<name>` keying a worktree's claim file
 * is the worktree directory's basename reduced to a safe scope token.
 *
 * @module domains/worktree/worktree-name
 */

import { basename } from "node:path";

// A separator is anything outside the kept set — letters, digits, and
// underscore. Hyphen is a separator, not kept, so a leading, trailing, or
// repeated hyphen never survives into the claim name.
const SEPARATOR_CHARACTER = /[^a-z0-9_]/;
const NAME_SEPARATOR = "-";

/**
 * The claim name for a worktree root path: its basename lowercased, then split
 * on each separator character and the non-empty segments rejoined with a single
 * hyphen. Splitting on the separator collapses runs and drops edge separators
 * without a quantified pattern, so the result is a safe scope token.
 */
export function worktreeClaimName(worktreeRoot: string): string {
  return basename(worktreeRoot)
    .toLowerCase()
    .split(SEPARATOR_CHARACTER)
    .filter((segment) => segment.length > 0)
    .join(NAME_SEPARATOR);
}
