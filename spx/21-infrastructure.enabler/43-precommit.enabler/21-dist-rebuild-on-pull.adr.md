# Dist Rebuild On Pull

The `rebuild-dist` hooks rebuild packaged output after `post-merge` and after `post-rewrite` rebase events in the repository's main checkout as defined by `spx/15-worktree-management.pdr.md`. The hooks install dependencies before invoking a TypeScript main-checkout gate, and the gate delegates complete worktree classification to the tested `isMainCheckout` model instead of duplicating repository-topology rules in shell. When gathered facts identify a bare-pool layout but lack a successful worktree-list read, the gate returns the rebuild exit code so a probe failure cannot become a silent skip; the product's self-release workflow keeps the default branch checked out in that main checkout, verifies release tags by ref without checking them out, and refreshes the operator-visible CLI by fast-forwarding and building the main checkout on the default branch.

## Rationale

The global `spx` executable resolves through the main checkout's built `dist/`, so that checkout is the only worktree whose rebuild updates shared operational behavior. Keeping the default branch checked out there makes Git's single-worktree branch occupancy the safety boundary that prevents a linked worktree from acquiring the release branch. Tag checkout would release that boundary and let a linked worktree become the default-branch mutation site, while ref-based tag verification preserves exact release identity without changing checkout state. Installing before the TypeScript gate accepts a cheap no-op in ordinary non-main worktrees and a possible dependency refresh after lockfile changes; duplicating the gate in POSIX shell would split the main-checkout definition across two systems.

## Verification

### Audit

- ALWAYS: `post-merge.rebuild-dist` installs dependencies with `pnpm install --frozen-lockfile`, invokes `pnpm exec tsx src/lib/precommit/main-checkout-gate.ts`, and runs `pnpm run build` only when that gate exits successfully ([audit])
- ALWAYS: `post-rewrite.rebuild-dist` performs the rebuild path only for the `rebase` hook argument and skips every other hook argument ([audit])
- ALWAYS: `src/lib/precommit/main-checkout-gate.ts` delegates complete main-checkout classification to `isMainCheckout` from `src/lib/git/root.ts`, which is governed by `spx/15-worktree-management.pdr.md`, and maps incomplete bare-pool worktree-list facts to the rebuild exit code ([audit])
- ALWAYS: TypeScript code governed by this decision keeps main-checkout classification fact-shaped and reachable through exported functions so tests exercise explicit worktree facts rather than lefthook shell side effects ([audit])
- ALWAYS: product self-release instructions identify the main checkout through `spx/15-worktree-management.pdr.md` and preserve its default-branch occupancy while verifying a release tag and refreshing the operator-visible CLI ([audit])
- NEVER: lefthook shell snippets re-derive the main-checkout topology from branch names, `.git` path shape, or duplicated repository-layout predicates ([audit])
- NEVER: tests for this gate replace `src/lib/git/root.ts` through framework-level module replacement; they exercise real exported functions or explicit process boundaries ([audit])
- NEVER: product self-release instructions detach the main checkout, switch it away from the default branch, or direct a linked worktree to check out the default branch ([audit])
