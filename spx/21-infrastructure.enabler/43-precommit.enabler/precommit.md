# Precommit

PROVIDES lefthook-managed local hook machinery: a selective vitest runner that classifies git-staged files and a main-checkout-gated dist rebuild path for pull and rebase events
SO THAT `lefthook`'s pre-commit hook and rebuild-dist hooks
CAN block commits when staged changes break their related tests, keep the main checkout's packaged `dist/` current after incoming changes, and skip rebuilds in non-main worktrees

## Assertions

### Scenarios

- Given a staged file list containing only non-code files (README, package.json, config), when the runner executes, then vitest is not invoked and the runner exits zero ([test](tests/run.scenario.l1.test.ts))
- Given a staged file list containing one or more test files, when the runner executes, then vitest runs with `--run` followed by those test paths and the runner's exit code equals vitest's exit code ([test](tests/run.scenario.l1.test.ts))
- Given a staged file list containing one or more source files, when the runner executes, then vitest runs with `related --run` followed by those source paths and the runner's exit code equals vitest's exit code ([test](tests/run.scenario.l1.test.ts))
- Given a staged file list mixing test and source files, when the runner executes, then vitest runs with `related --run` followed by only the source paths ([test](tests/build-args.mapping.l1.test.ts))
- Given a staged failing test, when a user attempts `git commit`, then the lefthook pre-commit hook blocks the commit and surfaces the failure output ([test](tests/precommit.scenario.l2.test.ts))
- Given a staged passing test, when a user attempts `git commit`, then the lefthook pre-commit hook allows the commit ([test](tests/precommit.scenario.l2.test.ts))
- Given staged files that are exclusively non-test-relevant, when a user attempts `git commit`, then the lefthook pre-commit hook skips vitest and allows the commit ([test](tests/precommit.scenario.l2.test.ts))

### Mappings

- File categorization: a path containing `.test.ts` maps to `test`; a path starting with `src/` maps to `source`; every other path maps to `other` ([test](tests/categorize.mapping.l1.test.ts))
- Test relevance: paths mapped to `test` or `source` are retained by `filterTestRelevantFiles`; paths mapped to `other` are filtered out ([test](tests/categorize.mapping.l1.test.ts))
- Vitest invocation shape: the empty list maps to `[]`; a test-files-only list maps to `["--run", ...testFiles]`; a list containing any source file maps to `["related", "--run", ...sourceFiles]` ([test](tests/build-args.mapping.l1.test.ts))

### Properties

- Classification is deterministic: for every path `p`, `categorizeFile(p)` returns the same category on repeated calls ([test](tests/categorize.property.l1.test.ts))
- Test-relevance filter is idempotent: for every file list `F`, `filterTestRelevantFiles(filterTestRelevantFiles(F))` equals `filterTestRelevantFiles(F)` ([test](tests/categorize.property.l1.test.ts))

### Compliance

- ALWAYS: the runner exits zero when `filterTestRelevantFiles` returns an empty list — non-code-only commits proceed without running vitest ([test](tests/run.compliance.l1.test.ts))
- ALWAYS: the runner's exit code equals the vitest process exit code when vitest is invoked — lefthook observes vitest's verdict directly ([test](tests/run.compliance.l1.test.ts))
- NEVER: invoke vitest when `filterTestRelevantFiles` returns an empty list — avoids running the suite for commits that touch no code ([test](tests/run.compliance.l1.test.ts))
- NEVER: pass `other`-category paths to vitest as arguments — the runner forwards only the retained test-relevant files ([test](tests/run.compliance.l1.test.ts))
- ALWAYS: `src/lib/precommit/run.ts` is the command lefthook invokes for the `pre-commit.tests` hook, matching the `run:` entry in `lefthook.yml` ([audit])
- ALWAYS: `lefthook.yml` declares `post-merge.rebuild-dist` and `post-rewrite.rebuild-dist` according to `spx/21-infrastructure.enabler/43-precommit.enabler/21-dist-rebuild-on-pull.adr.md` ([audit])
- ALWAYS: `src/lib/precommit/main-checkout-gate.ts` is the command lefthook invokes to decide whether rebuild-dist runs in the current worktree, and that gate delegates to the main-checkout classifier governed by `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: subprocess commands spawned from precommit integration tests through the git environment harness run with `GITHUB_ACTIONS` stripped from the environment — vitest invocations that lefthook triggers inside the fixture report their results through the process exit code only, never by posting annotations to the parent GitHub Actions run ([test](tests/subprocess-env.compliance.l1.test.ts))
