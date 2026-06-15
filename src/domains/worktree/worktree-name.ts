/**
 * Worktree claim-name derivation — the `<name>` keying a worktree's claim file
 * is the worktree directory's basename reduced to a safe scope token.
 *
 * @module domains/worktree/worktree-name
 */

import { basename } from "node:path";

const UNSAFE_NAME_CHARACTER = /[^a-z0-9_-]/;
const NAME_SEPARATOR = "-";

/**
 * The claim name for a worktree root path: its basename lowercased to a scope
 * token. Splitting on each unsafe character and rejoining the non-empty
 * segments collapses runs of unsafe characters to one separator and trims the
 * edges, without a quantified pattern.
 */
export function worktreeClaimName(worktreeRoot: string): string {
  return basename(worktreeRoot)
    .toLowerCase()
    .split(UNSAFE_NAME_CHARACTER)
    .filter((segment) => segment.length > 0)
    .join(NAME_SEPARATOR);
}
