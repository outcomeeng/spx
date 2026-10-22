# Evidence Reuse

`spx test` reports the verdicts of a recorded passed run, and invokes no runner, when that run covers every selected test file and its recorded inputs equal the current inputs of a clean checkout. A result taken from a recorded run names that run and writes no run file; a caller can require execution of the selection instead.

## Rationale

A passed run over identical selection and inputs establishes nothing a repeat run does not already hold, so repeating it spends the host and adds no evidence. Reuse stays confined to `spx test` because the run journal that status folds and CI reproduces must hold only executions.

## Product properties

1. A request that a recorded passed run satisfies returns that run's verdicts without invoking a runner, and names the run it took them from.
2. A request that no recorded run satisfies executes its selection and records a new run.
3. Run files record executions only: reuse adds, rewrites, and removes none.

## Verification

- ALWAYS: when a terminal run with status `passed` covers every test file `spx test` selects, its four staleness digests equal the current values, its head commit equals the current head commit, and the worktree holds no uncommitted change to a git-visible product file, `spx test` reports that run's verdicts as its result and invokes no runner
- ALWAYS: a failed, interrupted, incomplete, or stale run never satisfies a request, and a request that no single run satisfies executes its selection
- ALWAYS: a result taken from a recorded run names that run, so a reader tells a reused result from a fresh one
- NEVER: a result taken from a recorded run writes a run file, so every run file records an execution and the latest covering run that status reads is unchanged by a reuse
- ALWAYS: a caller can require execution of the selection, and the request then dispatches the selection whether or not a recorded run satisfies it
- NEVER: a command other than `spx test` consults a recorded run to skip execution, so the sealed run journal that status folds and CI reproduces holds only executions
