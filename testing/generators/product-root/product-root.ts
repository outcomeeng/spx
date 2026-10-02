import * as fc from "fast-check";

import {
  arbitraryBarePoolLayoutCase,
  arbitraryNonBareLinkedLayoutCase,
  arbitrarySingleTreeLayoutCase,
  type WorktreeLayoutCase,
} from "@testing/generators/main-checkout/main-checkout";

/**
 * One generated layout from each checkout layout class git produces — a non-bare
 * single-tree repository, a non-bare repository with a linked worktree, and a
 * bare-repository pool — so a real-git test ranges over every class rather than
 * the single-clone shape where the worktree root and the common-dir parent agree.
 */
export function arbitraryCheckoutLayoutCases(): fc.Arbitrary<readonly WorktreeLayoutCase[]> {
  return fc.tuple(
    arbitrarySingleTreeLayoutCase(),
    arbitraryNonBareLinkedLayoutCase(),
    arbitraryBarePoolLayoutCase(),
  );
}
