# Testing Last-Run Directory Structure

Spec-tree test run observations are stored under `.spx/local/testing/runs/{run-directory}/state.json` at the local worktree root (`spx/15-worktree-resolution.pdr.md`), where `run-directory` is `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}`. Each terminal run writes one `state.json` envelope recording the checkout's branch name and head SHA, the resolved testing config digest, runner outcomes, the discovered-test path and content digests, descriptor-declared product input digests, timestamps, and terminal status; a run directory without a parse-valid `state.json` is incomplete evidence.

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

For each node, fast status selects the latest terminal run whose runner outcomes cover that node's tests, ordered by greatest `completedAt`, then `startedAt`, then lexicographically greatest run-directory name, and treats that node's evidence as stale when any recorded staleness digest differs from the current value, drawing config digests from `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`. Node-scoped selection keeps a per-node run's evidence usable for its node after a later run records other nodes, rather than letting the single newest run hide it.

## Rationale

Per-worktree state keeps a branch's observations with the working copy that produced them: a worktree's evidence is private to it and is discarded with the worktree, rather than accumulating under a shared root. Resolving to the local worktree root through the `.spx/local/*` tier removes any need to partition state by branch, because each worktree holds one checkout — which also removes the prior dependency on the audit branch-slug helper. Digest-based staleness keeps state as evidence only: config and product inputs remain the source of truth, and cached observations are used only when every recorded staleness input still matches. The timestamp-plus-run-id directory shape gives each run a unique, time-ordered directory so successive and concurrent runs never collide.

## Invariants

- Testing state for a worktree resolves under that worktree's `.spx/local/testing/` directory.
- A run directory without a parse-valid `state.json` is incomplete evidence and cannot satisfy fast status.
- Per-node lookup selects the latest terminal run covering the node, ordering terminal runs by `state.json` timestamps before using directory names as a tie-breaker.
- Staleness compares the resolved testing config digest, discovered-test path digest, discovered-test content digest, and descriptor-declared product input digests.
- Deleting testing state changes only cached-observation availability, never passing-scope policy.

## Verification

### Audit

- ALWAYS: store testing last-run state under `.spx/local/testing/runs/{run-directory}/state.json` at the local worktree root per `spx/15-worktree-resolution.pdr.md` ([audit])
- ALWAYS: name run directories `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}` ([audit])
- ALWAYS: record branch name, head SHA, testing config digest, runner outcomes, discovered-test path and content digests, descriptor-declared product input digests, timestamps, and terminal status in `state.json` ([audit])
- ALWAYS: treat a run directory without a parse-valid `state.json` as incomplete evidence ([audit])
- ALWAYS: select, for each node, the latest terminal run covering that node's tests by greatest `completedAt`, then `startedAt`, then run-directory name ([audit])
- ALWAYS: mark cached evidence stale when any recorded staleness input differs from the current input ([audit])
- NEVER: store testing state under the Git common-dir product root or partition it by branch slug — per-worktree resolution makes branch partitioning redundant ([audit])
- NEVER: infer passing scope from testing last-run state ([audit])
