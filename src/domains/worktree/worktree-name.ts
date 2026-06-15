/**
 * Worktree claim-name derivation — the `<name>` keying a worktree's claim file
 * is the worktree directory's basename reduced to a safe scope token.
 *
 * @module domains/worktree/worktree-name
 */

import { basename } from "node:path";

const UNSAFE_NAME_CHARACTERS = /[^a-z0-9_-]+/g;
const EDGE_SEPARATORS = /^-+|-+$/g;
const NAME_SEPARATOR = "-";

/** The claim name for a worktree root path: its basename lowercased to a scope token. */
export function worktreeClaimName(worktreeRoot: string): string {
  return basename(worktreeRoot)
    .toLowerCase()
    .replace(UNSAFE_NAME_CHARACTERS, NAME_SEPARATOR)
    .replace(EDGE_SEPARATORS, "");
}
