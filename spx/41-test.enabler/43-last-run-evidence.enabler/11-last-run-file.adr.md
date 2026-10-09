# Test Last-Run File Structure

Spec-tree test run observations are stored under `.spx/worktree/test/runs/run-{run-token}.jsonl` at the local worktree root ([`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md)), where `run-token` is `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}`. Each terminal run writes one JSONL record recording the checkout's branch name and head SHA, the resolved testing config digest, runner outcomes with a verdict per test path, the discovered-test path and content digests, testing-language-declared product input digests, timestamps, and terminal status; a run file without a parse-valid JSONL terminal record is incomplete evidence.

```ts
interface TestRunState {
  readonly branchName: string;
  readonly headSha: string;
  readonly testingConfigDigest: string;
  readonly runnerOutcomes: readonly TestRunnerOutcome[];
  readonly discoveredTestPathsDigest: string;
  readonly discoveredTestContentDigest: string;
  readonly productInputDigests: readonly ProductInputDigest[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: "passed" | "failed" | "interrupted";
}

interface TestRunnerOutcome {
  readonly runnerId: string;
  readonly testPaths: readonly string[];
  readonly exitCode: number;
  readonly pathVerdicts: readonly TestPathVerdict[];
}

interface TestPathVerdict {
  readonly testPath: string;
  readonly verdict: "passed" | "failed" | "not-run";
}

interface ProductInputDigest {
  readonly descriptorId: string;
  readonly digest: string;
}
```

Each runner outcome carries exactly one `TestPathVerdict` for every path in its `testPaths`. A path's verdict is the one the runner's own machine-readable report states for that test file: `passed` when every test in the file passed, `failed` when any test in the file failed or the file failed to run, and `not-run` when the report omits the path. An invocation whose report is missing or unreadable records every one of its paths `not-run`, and the run's terminal status is `failed`, so a missing report never reads as a verdict. The invocation's `exitCode` stays recorded as the runner process's exit code and is never the source of a path's verdict.

For each node, fast status selects the latest terminal run whose runner outcomes cover that node's tests, ordered by greatest `completedAt`, then `startedAt`, then lexicographically greatest run file name, and treats that node's evidence as stale when any recorded staleness digest differs from the current value, drawing config digests from `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`. Node-scoped selection keeps a per-node run's evidence usable for its node after a later run records other nodes, rather than letting the single newest run hide it.

## Rationale

Per-worktree state keeps a branch's observations with the working copy that produced them: a worktree's evidence is private to it and is discarded with the worktree, rather than accumulating under a shared root. Resolving to the local worktree root through the `.spx/worktree/*` tier removes any need to partition state by branch, because each worktree holds one checkout. Digest-based staleness keeps state as evidence only: config and product inputs remain the source of truth, and cached observations are used only when every recorded staleness input still matches. The timestamp-plus-run-id file shape gives each run a unique, time-ordered file so successive and concurrent runs never collide. A verdict per test path, taken from the runner's report, attributes a result to each linked test reference: a runner invocation spans many test files, so its exit code alone would give every file the invocation covered the same result and one failing file would mark all of them failed. Recording `not-run` for an omitted path and for every path of an unreadable-report invocation keeps absence of a report distinct from a verdict, so no consumer reads silence as a pass.

## Invariants

- Testing state for a worktree resolves under that worktree's `.spx/worktree/test/` directory.
- A run file without a parse-valid JSONL record is incomplete evidence and cannot satisfy fast status.
- Per-node lookup selects the latest terminal run covering the node, ordering terminal runs by JSONL record timestamps before using run file names as a tie-breaker.
- Staleness compares the resolved testing config digest, discovered-test path digest, discovered-test content digest, and testing-language-declared product input digests.
- Deleting testing state changes only cached-observation availability, never passing-scope policy.
- Every runner outcome holds one path verdict per recorded test path, and each verdict is `passed`, `failed`, or `not-run`.
- A path verdict derives from the runner's machine-readable report and never from the invocation's exit code.
- A path the runner's report omits is `not-run`.
- An invocation whose report is missing or unreadable records every one of its paths `not-run` and fails the run.

## Verification

- ALWAYS: each runner outcome records one verdict per test path, drawn from `passed`, `failed`, and `not-run`
- ALWAYS: a path verdict is taken from the runner's machine-readable report for that test file
- ALWAYS: a test path the runner's report omits is recorded `not-run`
- ALWAYS: an invocation whose machine-readable report is missing or unreadable records every one of its test paths `not-run` and ends the run with terminal status `failed`
- NEVER: derive a path verdict from the exit code of the runner invocation that covered the path

### Audit

- ALWAYS: store testing last-run state under `.spx/worktree/test/runs/run-{run-token}.jsonl` at the local worktree root per [`spx/15-worktree-management.pdr.md`](spx/15-worktree-management.pdr.md) ([audit])
- ALWAYS: name run files `run-{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}.jsonl` ([audit])
- ALWAYS: record branch name, head SHA, testing config digest, runner outcomes with their per-path verdicts, discovered-test path and content digests, testing-language-declared product input digests, timestamps, and terminal status in the JSONL record ([audit])
- ALWAYS: treat a run file without a parse-valid JSONL record as incomplete evidence ([audit])
- ALWAYS: select, for each node, the latest terminal run covering that node's tests by greatest `completedAt`, then `startedAt`, then run file name ([audit])
- ALWAYS: mark cached evidence stale when any recorded staleness input differs from the current input ([audit])
- NEVER: store testing state under the Git common-dir product root or partition it by branch slug — per-worktree resolution makes branch partitioning redundant ([audit])
- NEVER: infer passing scope from testing last-run state ([audit])
