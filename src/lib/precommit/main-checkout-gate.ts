/**
 * Main-checkout gate for lefthook's rebuild-dist hooks.
 *
 * Exits zero when the current worktree is the repository's main checkout — the
 * only worktree whose `dist/` feeds the published or pnpm-linked `spx` — and
 * non-zero otherwise, so the `post-merge` / `post-rewrite` rebuild-dist hooks
 * rebuild only there. Routes the decision through the tested {@link isMainCheckout}
 * classifier instead of re-deriving worktree topology in shell, so the gate
 * stays correct for both a non-bare repository and a bare-repository pool.
 *
 * @module lib/precommit/main-checkout-gate
 */

import { gatherGitFacts, isMainCheckout } from "@/git/root";
import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "./entrypoint";

/** Exit code signaling the current worktree IS the main checkout — rebuild `dist/`. */
const EXIT_MAIN_CHECKOUT = 0;
/** Exit code signaling a non-main worktree — skip the rebuild. */
const EXIT_NON_MAIN_CHECKOUT = 1;

/**
 * Resolves whether the current worktree is the main checkout. A null fact read
 * means the gate ran outside a git repository; the hooks fire only inside one,
 * so the unreadable case is treated as the main checkout to never skip the
 * rebuild silently — matching the prior shell gate's fallback.
 */
async function main(): Promise<void> {
  const facts = await gatherGitFacts();
  const isMain = facts === null || isMainCheckout(facts);
  process.exit(isMain ? EXIT_MAIN_CHECKOUT : EXIT_NON_MAIN_CHECKOUT);
}

const isDirectExecution = typeof import.meta.url === "string"
  && isDirectPrecommitEntrypoint(
    import.meta.url,
    process.argv[1],
    PRECOMMIT_ENTRYPOINT.MAIN_CHECKOUT_GATE,
  );

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error("Main-checkout gate failed:", error);
    process.exit(EXIT_MAIN_CHECKOUT);
  }
}
