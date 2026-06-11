# Testing Last-Run File Structure

Spec-tree test run observations are stored under `.spx/worktree/test/runs/run-{run-token}.jsonl` at the local worktree root (`spx/15-worktree-management.pdr.md`), where `run-token` is `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}`. Each terminal run writes one JSONL record recording the checkout's branch name and head SHA, the resolved testing config digest, runner outcomes, the discovered-test path and content digests, testing-language-declared product input digests, timestamps, and terminal status; a run file without a parse-valid JSONL terminal record is incomplete evidence.

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
}

interface ProductInputDigest {
  readonly descriptorId: string;
  readonly digest: string;
}
```

For each node, fast status selects the latest terminal run whose runner outcomes cover that node's tests, ordered by greatest `completedAt`, then `startedAt`, then lexicographically greatest run file name, and treats that node's evidence as stale when any recorded staleness digest differs from the current value, drawing config digests from `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`. Node-scoped selection keeps a per-node run's evidence usable for its node after a later run records other nodes, rather than letting the single newest run hide it.

## Rationale

Per-worktree state keeps a branch's observations with the working copy that produced them: a worktree's evidence is private to it and is discarded with the worktree, rather than accumulating under a shared root. Resolving to the local worktree root through the `.spx/worktree/*` tier removes any need to partition state by branch, because each worktree holds one checkout. Digest-based staleness keeps state as evidence only: config and product inputs remain the source of truth, and cached observations are used only when every recorded staleness input still matches. The timestamp-plus-run-id file shape gives each run a unique, time-ordered file so successive and concurrent runs never collide.

## Invariants

- Testing state for a worktree resolves under that worktree's `.spx/worktree/test/` directory.
- A run file without a parse-valid JSONL record is incomplete evidence and cannot satisfy fast status.
- Per-node lookup selects the latest terminal run covering the node, ordering terminal runs by JSONL record timestamps before using run file names as a tie-breaker.
- Staleness compares the resolved testing config digest, discovered-test path digest, discovered-test content digest, and testing-language-declared product input digests.
- Deleting testing state changes only cached-observation availability, never passing-scope policy.

## Verification

### Audit

- ALWAYS: store testing last-run state under `.spx/worktree/test/runs/run-{run-token}.jsonl` at the local worktree root per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: name run files `run-{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}.jsonl` ([audit])
- ALWAYS: record branch name, head SHA, testing config digest, runner outcomes, discovered-test path and content digests, testing-language-declared product input digests, timestamps, and terminal status in the JSONL record ([audit])
- ALWAYS: treat a run file without a parse-valid JSONL record as incomplete evidence ([audit])
- ALWAYS: select, for each node, the latest terminal run covering that node's tests by greatest `completedAt`, then `startedAt`, then run file name ([audit])
- ALWAYS: mark cached evidence stale when any recorded staleness input differs from the current input ([audit])
- NEVER: store testing state under the Git common-dir product root or partition it by branch slug — per-worktree resolution makes branch partitioning redundant ([audit])
- NEVER: infer passing scope from testing last-run state ([audit])
