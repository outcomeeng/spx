# Precommit

PROVIDES lefthook-managed local hook machinery: a main-checkout-gated dist rebuild path for pull and rebase events and a post-checkout dependency-install gate for checkout events
SO THAT `lefthook`'s rebuild-dist hooks and post-checkout hook
CAN keep the main checkout's packaged `dist/` current after incoming changes, preserve its default-branch occupancy while product self-release instructions verify tags and refresh the operator-visible CLI, skip rebuilds in non-main worktrees, install dependencies in any worktree advanced to a new commit when the checkout changes the lockfile, and leave build, validation, test execution, and SonarQube fixture-exclusion synchronization to CI, cloud analysis, or explicit operator and agent commands

## Assertions

### Scenarios

- Given a branch checkout with a real previous ref, when the post-checkout gate resolves its exit code through an injected git runner, then a lockfile-scoped diff containing the lockfile yields the install exit code, an empty diff yields the skip exit code, and a probe that errors — throwing or resolving a non-zero git exit code — yields the failure exit code ([test](tests/deps-install-gate.scenario.l1.test.ts))

### Mappings

- TypeScript hook entrypoint recognition maps POSIX and Windows argv paths for the invoked precommit script to direct execution, and maps a mismatched argv path to not-direct execution ([test](tests/entrypoint.mapping.l1.test.ts))
- Main-checkout gate exit-code classification maps unreadable git facts, incomplete bare-pool worktree-list facts, and main-checkout facts to the rebuild exit code, and maps non-main checkout facts to the classified skip exit code ([test](tests/main-checkout-gate.mapping.l1.test.ts))
- Post-checkout install-gate exit-code classification maps a branch-or-HEAD checkout whose lockfile changed to the install exit code, and maps a file checkout or an unchanged lockfile to the skip exit code ([test](tests/deps-install-gate.mapping.l1.test.ts))
- Post-checkout fact resolution maps the git branch-checkout flag to the branch-checkout fact, maps a null or all-zero previous ref to a changed lockfile, and maps a real previous ref to a changed lockfile exactly when the lockfile-scoped diff is non-empty ([test](tests/deps-install-gate.mapping.l1.test.ts))

### Compliance

- NEVER: `lefthook.yml` declares a `pre-commit` hook section or pre-commit commands ([test](tests/hook-install.compliance.l1.test.ts))
- NEVER: `lefthook.yml` declares a `pre-push` hook that runs full build, validation, or test commands ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: `lefthook.yml` declares `post-merge.rebuild-dist` and `post-rewrite.rebuild-dist` according to `spx/21-infrastructure.enabler/43-precommit.enabler/21-dist-rebuild-on-pull.adr.md` ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: `src/lib/precommit/main-checkout-gate.ts` is the command lefthook invokes to decide whether rebuild-dist runs in the current worktree, and that gate delegates to the main-checkout classifier governed by `spx/15-worktree-management.pdr.md` ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: `lefthook.yml` declares a `post-checkout` hook that runs `pnpm install --frozen-lockfile` only when the post-checkout install gate signals install, per `spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md` ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: the rendered portable lefthook hook, in its no-reachable-lefthook fallback, runs `pnpm install --frozen-lockfile` and then invokes the worktree-local lefthook binary directly rather than `pnpm exec lefthook`, per `spx/21-infrastructure.enabler/43-precommit.enabler/79-portable-hook-provisioning.adr.md` ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: the rendered portable lefthook hook prefers the worktree-local lefthook binary over a `PATH` lefthook binary, while still honoring `LEFTHOOK_BIN` as the explicit override ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: obsolete-hook cleanup deletes any de-configured Git hook that carries the portable lefthook shim marker, while never deleting a handwritten hook that lacks the marker ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: subprocess commands spawned from precommit integration tests through the git environment harness run with `GITHUB_ACTIONS` stripped from the environment — test invocations that lefthook triggers inside the fixture report their results through the process exit code only, never by posting annotations to the parent GitHub Actions run ([test](tests/subprocess-env.compliance.l1.test.ts))
- ALWAYS: product self-release instructions keep the default branch checked out in the main checkout, verify release tags without checking them out, and rebuild the operator-visible CLI only when the checkout's HEAD equals the release tag commit, so Git refuses the occupied default branch to linked worktrees and later commits never ship under the released version ([audit])
