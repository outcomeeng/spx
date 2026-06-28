# Precommit

PROVIDES lefthook-managed local hook machinery: a selective default-config `spx test --changed --staged` runner and non-default-config operand runner that classify git-staged files, a fixture-exclusion drift check, a main-checkout-gated dist rebuild path for pull and rebase events, and a post-checkout dependency-install gate for checkout events
SO THAT `lefthook`'s pre-commit hook, rebuild-dist hooks, and post-checkout hook
CAN block commits when staged changes break their related tests, block commits when fixture exclusion policy drifts, keep the main checkout's packaged `dist/` current after incoming changes, skip rebuilds in non-main worktrees, install dependencies in any worktree advanced to a new commit when the checkout changes the lockfile, and leave full build/validation/test execution to CI or explicit operator commands

## Assertions

### Scenarios

- Given a staged file list containing only non-code files outside product config (README, package.json), when the runner executes, then `spx test` is not invoked and the runner exits zero ([test](tests/run.scenario.l1.test.ts))
- Given a staged file list containing only a product config file under default precommit config, when the runner executes, then `spx test --changed --staged --base HEAD` runs and the runner's exit code equals the `spx test` exit code ([test](tests/run.scenario.l1.test.ts))
- Given a staged file list containing one or more test files under default precommit config, when the runner executes, then `spx test --changed --staged --base HEAD` runs and the runner's exit code equals the `spx test` exit code ([test](tests/run.scenario.l1.test.ts))
- Given a staged file list containing one or more source files under default precommit config, when the runner executes, then `spx test --changed --staged --base HEAD` runs and the runner's exit code equals the `spx test` exit code ([test](tests/run.scenario.l1.test.ts))
- Given a staged file list mixing test and source files under default precommit config, when the runner executes, then `spx test --changed --staged --base HEAD` runs once for the changed set ([test](tests/build-args.mapping.l1.test.ts))
- Given non-default precommit config with custom source directories or test pattern, when the runner executes for retained staged files, then the operand runner receives the config-classified paths and the runner's exit code is observed directly ([test](tests/run.scenario.l1.test.ts))
- Given a staged failing test, when a user attempts `git commit`, then the lefthook pre-commit hook blocks the commit and surfaces the failure output ([test](tests/precommit.scenario.l2.test.ts))
- Given a staged passing test, when a user attempts `git commit`, then the lefthook pre-commit hook allows the commit ([test](tests/precommit.scenario.l2.test.ts))
- Given staged files that are exclusively non-test-relevant, when a user attempts `git commit`, then the lefthook pre-commit hook skips `spx test` and allows the commit ([test](tests/precommit.scenario.l2.test.ts))
- Given a branch checkout with a real previous ref, when the post-checkout gate resolves its exit code through an injected git runner, then a lockfile-scoped diff containing the lockfile yields the install exit code, an empty diff yields the skip exit code, and a probe that errors — throwing or resolving a non-zero git exit code — yields the failure exit code ([test](tests/deps-install-gate.scenario.l1.test.ts))

### Mappings

- File categorization: a product config file maps to `config`; a path containing `.test.ts` maps to `test`; a path starting with `src/` maps to `source`; every other path maps to `other` ([test](tests/categorize.mapping.l1.test.ts))
- Test relevance: paths mapped to `config`, `test`, or `source` are retained by `filterTestRelevantFiles`; paths mapped to `other` are filtered out ([test](tests/categorize.mapping.l1.test.ts))
- Default-config test invocation shape: the empty list maps to `[]`; any retained test-relevant or product-config list maps to `["test", "--changed", "--staged", "--base", "HEAD"]` ([test](tests/build-args.mapping.l1.test.ts))
- Non-default-config operand invocation shape: retained source files map to `["related", "--run", ...sourceFiles]`, and retained test files with no source files map to `["--run", ...testFiles]` ([test](tests/build-args.mapping.l1.test.ts))
- TypeScript hook entrypoint recognition maps POSIX and Windows argv paths for the invoked precommit script to direct execution, and maps a mismatched argv path to not-direct execution ([test](tests/entrypoint.mapping.l1.test.ts))
- Main-checkout gate exit-code classification maps unreadable git facts, incomplete bare-pool worktree-list facts, and main-checkout facts to the rebuild exit code, and maps non-main checkout facts to the classified skip exit code ([test](tests/main-checkout-gate.mapping.l1.test.ts))
- Post-checkout install-gate exit-code classification maps a branch-or-HEAD checkout whose lockfile changed to the install exit code, and maps a file checkout or an unchanged lockfile to the skip exit code ([test](tests/deps-install-gate.mapping.l1.test.ts))
- Post-checkout fact resolution maps the git branch-checkout flag to the branch-checkout fact, maps a null or all-zero previous ref to a changed lockfile, and maps a real previous ref to a changed lockfile exactly when the lockfile-scoped diff is non-empty ([test](tests/deps-install-gate.mapping.l1.test.ts))

### Properties

- Classification is deterministic: for every path `p`, `categorizeFile(p)` returns the same category on repeated calls ([test](tests/categorize.property.l1.test.ts))
- Test-relevance filter is idempotent: for every file list `F`, `filterTestRelevantFiles(filterTestRelevantFiles(F))` equals `filterTestRelevantFiles(F)` ([test](tests/categorize.property.l1.test.ts))

### Compliance

- ALWAYS: the runner exits zero when `filterTestRelevantFiles` returns an empty list — non-code-only commits proceed without running `spx test` ([test](tests/run.compliance.l1.test.ts))
- ALWAYS: the runner's exit code equals the `spx test` process exit code when `spx test` is invoked — lefthook observes the product test verdict directly ([test](tests/run.compliance.l1.test.ts))
- NEVER: invoke `spx test` when `filterTestRelevantFiles` returns an empty list — avoids running the suite for commits that touch no code ([test](tests/run.compliance.l1.test.ts))
- NEVER: pass staged path operands to `spx test` as arguments — the hook delegates changed-set resolution to `spx test --changed --staged --base HEAD` ([test](tests/run.compliance.l1.test.ts))
- ALWAYS: non-default precommit `sourceDirs` or `testPattern` route through the operand runner rather than changed-set planning, so precommit-owned classification remains honored when it differs from the product-owned changed-set roots and TypeScript test suffixes ([test](tests/run.scenario.l1.test.ts))
- ALWAYS: staged path enumeration uses NUL-delimited name-status output and includes deleted and renamed paths instead of filtering by added/copied/modified status only ([test](tests/run.compliance.l1.test.ts))
- ALWAYS: `src/lib/precommit/run.ts` is the command lefthook invokes for the `pre-commit.tests` hook, matching the `run:` entry in `lefthook.yml` ([audit])
- ALWAYS: `lefthook.yml` keeps local pre-commit work selective and does not declare a `pre-push` hook that runs full build, validation, or test commands; those full gates run through CI or explicit operator commands ([audit])
- ALWAYS: `lefthook.yml` declares `post-merge.rebuild-dist` and `post-rewrite.rebuild-dist` according to `spx/21-infrastructure.enabler/43-precommit.enabler/21-dist-rebuild-on-pull.adr.md` ([audit])
- ALWAYS: `src/lib/precommit/main-checkout-gate.ts` is the command lefthook invokes to decide whether rebuild-dist runs in the current worktree, and that gate delegates to the main-checkout classifier governed by `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: `lefthook.yml` declares a `post-checkout` hook that runs `pnpm install --frozen-lockfile` only when the post-checkout install gate signals install, per `spx/21-infrastructure.enabler/43-precommit.enabler/60-deps-install-on-checkout.adr.md` ([audit])
- ALWAYS: the rendered portable lefthook hook, in its no-reachable-lefthook fallback, runs `pnpm install --frozen-lockfile` and then invokes the worktree-local lefthook binary directly rather than `pnpm exec lefthook`, per `spx/21-infrastructure.enabler/43-precommit.enabler/79-portable-hook-provisioning.adr.md` ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: obsolete-hook cleanup deletes any de-configured Git hook previously installed as a portable lefthook shim — recognized by a shim marker present in every rendered template version, so a shim rendered by an earlier template is still removed — while never deleting a handwritten hook that lacks the marker ([test](tests/hook-install.compliance.l1.test.ts))
- ALWAYS: subprocess commands spawned from precommit integration tests through the git environment harness run with `GITHUB_ACTIONS` stripped from the environment — test invocations that lefthook triggers inside the fixture report their results through the process exit code only, never by posting annotations to the parent GitHub Actions run ([test](tests/subprocess-env.compliance.l1.test.ts))
