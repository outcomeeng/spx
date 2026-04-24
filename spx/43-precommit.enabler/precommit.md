# Precommit

PROVIDES a selective vitest runner that classifies git-staged files, invokes vitest only on the tests related to staged test-relevant files, and propagates the vitest exit code
SO THAT `lefthook`'s pre-commit hook invoking the runner via `npx tsx src/precommit/run.ts`
CAN block commits when staged changes break their related tests without running the whole test suite on every commit

## Assertions

### Scenarios

- Given a staged file list containing only non-code files (README, package.json, config), when the runner executes, then vitest is not invoked and the runner exits zero ([test](tests/run.unit.test.ts))
- Given a staged file list containing one or more test files, when the runner executes, then vitest runs with `--run` followed by those test paths and the runner's exit code equals vitest's exit code ([test](tests/run.unit.test.ts))
- Given a staged file list containing one or more source files, when the runner executes, then vitest runs with `related --run` followed by those source paths and the runner's exit code equals vitest's exit code ([test](tests/run.unit.test.ts))
- Given a staged file list mixing test and source files, when the runner executes, then vitest runs with `related --run` followed by only the source paths ([test](tests/build-args.unit.test.ts))
- Given a staged source file path, when `findRelatedTestPaths` is called, then it returns exactly the unit and integration test paths derived from the source path by the canonical mapping ([test](tests/categorize.unit.test.ts))
- Given a staged failing test, when a user attempts `git commit`, then the lefthook pre-commit hook blocks the commit and surfaces the failure output ([test](tests/precommit.integration.test.ts))
- Given a staged passing test, when a user attempts `git commit`, then the lefthook pre-commit hook allows the commit ([test](tests/precommit.integration.test.ts))
- Given staged files that are exclusively non-test-relevant, when a user attempts `git commit`, then the lefthook pre-commit hook skips vitest and allows the commit ([test](tests/precommit.integration.test.ts))

### Mappings

- File categorization: a path containing `.test.ts` maps to `test`; a path starting with `src/` maps to `source`; every other path maps to `other` ([test](tests/categorize.unit.test.ts))
- Test relevance: paths mapped to `test` or `source` are retained by `filterTestRelevantFiles`; paths mapped to `other` are filtered out ([test](tests/categorize.unit.test.ts))
- Vitest invocation shape: the empty list maps to `[]`; a test-files-only list maps to `["--run", ...testFiles]`; a list containing any source file maps to `["related", "--run", ...sourceFiles]` ([test](tests/build-args.unit.test.ts))

### Properties

- Classification is deterministic: for every path `p`, `categorizeFile(p)` returns the same category on repeated calls ([test](tests/categorize.unit.test.ts))
- Test-relevance filter is idempotent: for every file list `F`, `filterTestRelevantFiles(filterTestRelevantFiles(F))` equals `filterTestRelevantFiles(F)` ([test](tests/categorize.unit.test.ts))

### Compliance

- ALWAYS: the runner exits zero when `filterTestRelevantFiles` returns an empty list — non-code-only commits proceed without running vitest ([test](tests/run.unit.test.ts))
- ALWAYS: the runner's exit code equals the vitest process exit code when vitest is invoked — lefthook observes vitest's verdict directly ([test](tests/run.unit.test.ts))
- NEVER: invoke vitest when `filterTestRelevantFiles` returns an empty list — avoids running the suite for commits that touch no code ([test](tests/run.unit.test.ts))
- NEVER: pass `other`-category paths to vitest as arguments — the runner forwards only the retained test-relevant files ([test](tests/build-args.unit.test.ts))
- ALWAYS: `src/precommit/run.ts` is the command lefthook invokes for the `pre-commit.tests` hook, matching the `run:` entry in `lefthook.yml` ([review](../../lefthook.yml))
