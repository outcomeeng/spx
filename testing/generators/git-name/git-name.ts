/**
 * Generators for the git-name vocabulary shared across domains: the lowercase
 * path-segment shape that git directory names, repository names, and branch
 * names all draw from. Domains that build paths, origin URLs, worktree layouts,
 * release tags, or handoff git facts compose these rather than each redefining
 * the same segment pattern.
 *
 * @module generators/git-name
 */

import * as fc from "fast-check";

/** A single lowercase git-name unit: a leading letter, then lowercase alphanumerics and hyphens. */
const PATH_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const WHITESPACE_CHARACTER = [" ", "\t", "\n"] as const;

/** A single lowercase path segment. */
export function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(PATH_SEGMENT_PATTERN);
}

/** A lowercase path segment containing interior whitespace. */
export function arbitraryWhitespacePathSegment(): fc.Arbitrary<string> {
  return fc.tuple(
    arbitraryPathSegment(),
    fc.constantFrom(...WHITESPACE_CHARACTER),
    arbitraryPathSegment(),
  ).map(([left, whitespace, right]) => `${left}${whitespace}${right}`);
}

/** A git branch name shaped as a single path segment. */
export function arbitraryBranchName(): fc.Arbitrary<string> {
  return arbitraryPathSegment();
}
