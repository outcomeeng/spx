# Known Issues

## Process-exit removal evidence declares l2 above its floor `spx/13-temp-directory.substrate/tests/run-root.scenario.l2.test.ts` `Given a process that created a root, when it exits normally, then the root and everything inside it is removed` `evidence uses the lowest level that proves the assertion`

The file `spx/13-temp-directory.substrate/tests/run-root.scenario.l2.test.ts` carries the `l2` level in its name while its child process runs checkout source through the dev-environment tsx runner and a standard subprocess. Under the executable discriminator both executables are supplied by the declared development environment or the checkout, which classifies the evidence `l1`. The level-selection rule that evidence uses the lowest level that proves the assertion therefore places the file at `l1`.

**Impact:** the filename declares a heavier level than the evidence needs, so level-based test selection treats this evidence as heavier than it is. The evidence still proves the assertion that a process which created a root removes the root and everything inside it on normal exit.

**Settlement condition:** the filename level equals the level the executable discriminator assigns to the executables the evidence exercises, and the spec assertion's test link names the file at that level.

## Git-ceiling evidence declares l2 above its floor `spx/13-temp-directory.substrate/tests/git-ceiling.scenario.l2.test.ts` `Given a directory inside a run root that holds no repository of its own, when git runs there under the environment the primitive exports, then git finds no repository` `evidence uses the lowest level that proves the assertion`

The file `spx/13-temp-directory.substrate/tests/git-ceiling.scenario.l2.test.ts` carries the `l2` level in its name while its child process uses the tsx runner and standard git. Under the executable discriminator both executables are supplied by the declared development environment or the checkout, which classifies the evidence `l1`. The level-selection rule that evidence uses the lowest level that proves the assertion therefore places the file at `l1`.

**Impact:** the filename declares a heavier level than the evidence needs, so level-based test selection treats this evidence as heavier than it is. The evidence still fails when the ceiling export is removed, so it proves the assertion that git finds no repository in a run-root directory under the exported environment.

**Settlement condition:** the filename level equals the level the executable discriminator assigns to the executables the evidence exercises, and the spec assertion's test link names the file at that level.

## A root-creating call without an inherited root, and the first scratch request for a parent, sweep live directories (not proved)

Two edges of the decision in [`spx/13-temp-directory.substrate/21-run-scoped-temp-root.adr.md`](spx/13-temp-directory.substrate/21-run-scoped-temp-root.adr.md) rest on the premise that two runs never share one worktree at once. Neither edge is proved to fire; both are recorded at head 9680c29a530958072a9b4f96d6fb6ca6d7f3a963.

**Evidence (a), scrubbed-environment child:** a process that calls `createDirectory` without `SPX_RUN_TEMP_ROOT` in its environment creates its own root after removing every entry of its worktree's `.spx/worktree/test-runs/`, including the roots of live runs (`src/lib/temp-directory/index.ts` lines 116-134 and 142-148). The callers of `createDirectory` in `src` are `spx test`, which takes its root first; release notes (`src/commands/release/release-notes-filesystem.ts` line 93); and release docs sync (`src/commands/release/documentation-sync-filesystem.ts` line 177). Test harnesses start children with a scrubbed environment (`extendEnv: false` or `env: {}`) at `testing/harnesses/with-git-env.ts:109`, `git-test-constants.ts:139`, `:151`, `:174`, and `:191`, `verify/repository.ts:85`, `verify/built-cli.ts:120`, `verify/audit-fixtures.ts:90`, `spec/context.ts:463`, `state/nested-product-layout.ts:107`, `state/appendable-journal-store.ts:738`, `temp-directory/process.ts:61`, `temp-directory/spx-test-run.ts:157`, and `diagnose/worktree-snapshot-consumers.ts:74`. Whether any of those children runs a release command, and so sweeps live roots, is not traced.

**Evidence (b), scratch sweep:** `createScratchDirectory` removes every `spx-run-` entry in the scratch parent `node_modules/.cache/spx/` on a process's first request for that parent (`src/lib/temp-directory/index.ts` lines 156-172, sweep at 161-166). The callers are the knip and typescript validation steps (`src/validation/steps/knip.ts` line 185; `src/validation/steps/typescript.ts` lines 132 and 164). Two spx validation processes running at once over one product directory remove each other's live scratch directories. The product directory of such a test is usually a fixture inside a run root, which separates the processes; whether the sweep fires was not seen in the findings.

**Impact:** a live run root or scratch directory removed by an unrelated process surfaces as `ENOENT` or `ENOTEMPTY` inside the run that owned it, far from the process that removed it.

**Settlement condition:** for each edge, either evidence shows that no process in a run starts a root-creating call without the inherited root (a) and that concurrent validation processes never share a scratch parent (b), or the decision states a rule under which a root-creating call or a scratch sweep leaves live directories in place.
