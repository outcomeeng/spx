/**
 * Main-checkout gate for lefthook's rebuild-dist hooks.
 *
 * Exits zero when the current worktree is the repository's main checkout — the
 * only worktree whose `dist/` feeds the published or pnpm-linked `spx` — and
 * non-zero otherwise, so the `post-merge` / `post-rewrite` rebuild-dist hooks
 * rebuild only there. Routes complete-topology decisions through the tested
 * {@link isMainCheckout} classifier instead of re-deriving worktree topology in
 * shell, so the gate stays correct for both a non-bare repository and a
 * bare-repository pool.
 *
 * @module lib/precommit/main-checkout-gate
 */

import { gatherGitFacts, type GitFacts, isMainCheckout } from "@/lib/git/root";
import { isDirectPrecommitEntrypoint, PRECOMMIT_ENTRYPOINT } from "./entrypoint";

/** Exit codes emitted by the main-checkout gate. */
export const MAIN_CHECKOUT_GATE_EXIT_CODE = {
  /** The current worktree is the main checkout — rebuild `dist/`. */
  MAIN_CHECKOUT: 0,
  /** The current worktree is not the main checkout — skip the rebuild. */
  NON_MAIN_CHECKOUT: 78,
  /** The gate itself failed, so the hook must fail instead of skipping. */
  FAILURE: 1,
} as const;

export type MainCheckoutGateExitCode = (typeof MAIN_CHECKOUT_GATE_EXIT_CODE)[keyof typeof MAIN_CHECKOUT_GATE_EXIT_CODE];

function hasIncompleteBarePoolFacts(facts: GitFacts): boolean {
  return facts.commonDirIsBare && !facts.worktreeListRead;
}

/** Maps gathered git facts to the hook-facing gate exit code. */
export function mainCheckoutGateExitCode(facts: GitFacts | null): MainCheckoutGateExitCode {
  return facts === null || hasIncompleteBarePoolFacts(facts) || isMainCheckout(facts)
    ? MAIN_CHECKOUT_GATE_EXIT_CODE.MAIN_CHECKOUT
    : MAIN_CHECKOUT_GATE_EXIT_CODE.NON_MAIN_CHECKOUT;
}

/**
 * Resolves whether the current worktree is the main checkout. A null fact read
 * means the gate ran outside a git repository; the hooks fire only inside one,
 * so the unreadable case is treated as the main checkout to never skip the
 * rebuild silently — matching the prior shell gate's fallback.
 */
async function main(): Promise<void> {
  const facts = await gatherGitFacts();
  process.exit(mainCheckoutGateExitCode(facts));
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
    process.exit(MAIN_CHECKOUT_GATE_EXIT_CODE.FAILURE);
  }
}
