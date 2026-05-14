# Testing Last-Run Directory Structure

## Purpose

This decision governs how spec-tree test run observations are named and organized on disk under `.spx/testing/`.

## Context

**Business impact:** Developers and agents need fast spec status that reports recent test observations without re-running test suites. Persisted observations must stay branch-scoped because tracked `spx/` files differ by worktree branch while `.spx/` state is shared through the Git common-dir product root.

**Technical constraints:** Testing state is gitignored local state. It follows the worktree resolution rules in `spx/15-worktree-resolution.pdr.md`, uses the branch slug rules from `spx/36-audit.enabler/15-audit-directory.adr.md`, and records canonical testing config digests from `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`.

## Decision

Testing last-run state is stored under `.spx/testing/{branch-slug}/runs/{run-directory}/state.json` at the Git common-dir product root.

`branch-slug` uses the same filesystem-safe slugging rules and implementation as audit branch slugs in `spx/36-audit.enabler/15-audit-directory.adr.md`. `run-directory` uses the same timestamp-plus-run-id shape as audit run directories: `{YYYY-MM-DD_HH-mm-ss-SSS}-{run-id}`.

Each terminal run writes one `state.json` file containing the test run envelope. The file records branch identity, head SHA, resolved testing config digest, runner outcomes, discovered test path digest, discovered test content digest, descriptor-declared product input digests, timestamps, and terminal status. A run directory without parse-valid `state.json` is incomplete testing evidence and cannot satisfy fast status.

```ts
interface TestRunState {
  readonly branchName: string;
  readonly branchSlug: string;
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

Fast status selects the latest terminal testing state for the current branch by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run directory name as a deterministic tie-breaker. It treats cached evidence as stale when the current testing config digest, discovered test path digest, discovered test content digest, or descriptor-declared product input digest set differs from the recorded values.

## Rationale

Branch-scoped testing state prevents one worktree branch from supplying status evidence for another branch. Digest-based staleness keeps state as evidence only: config and product inputs remain the source of truth, and cached observations are used only when every recorded staleness input still matches.

The same branch slug and run directory conventions as audit keep `.spx/` state portable and predictable across domains without requiring a shared audit/testing state format.

## Trade-offs accepted

| Trade-off                                      | Mitigation / reasoning                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Testing state duplicates audit run conventions | Shared slug and run directory helpers keep behavior consistent while state schemas stay separate |
| Fast status may reject usable observations     | Conservative stale detection protects correctness; rejected observations can be refreshed by running tests |

## Invariants

- Testing state is grouped by branch slug before run history is inspected
- A run directory without parse-valid `state.json` is incomplete evidence and cannot satisfy fast status
- Latest terminal testing lookup orders terminal runs by `state.json` timestamps before using directory names as a tie-breaker
- Staleness comparison uses resolved testing config digest, discovered test path digest, discovered test content digest, and descriptor-declared product input digests
- Deleting testing state changes only cached-observation availability, never passing-scope policy

## Compliance

### Recognized by

A state file at `.spx/testing/work-config-backed-execution-scope-1a2b3c4d/runs/2026-04-25_15-45-00-123-a1b2c3d4e5f6/state.json`.

### MUST

- Store testing last-run state under `.spx/testing/{branch-slug}/runs/{run-directory}/state.json` at the Git common-dir product root ([review](../../15-worktree-resolution.pdr.md))
- Reuse the audit branch slug implementation for testing branch slugs ([review](../../36-audit.enabler/15-audit-directory.adr.md))
- Name run directories with the audit timestamp-plus-run-id shape ([review](../../36-audit.enabler/15-audit-directory.adr.md))
- Store branch identity, head SHA, testing config digest, runner outcomes, discovered test path digest, discovered test content digest, descriptor-declared product input digests, timestamps, and terminal status in `state.json` ([review])
- Treat run directories without parse-valid `state.json` as incomplete evidence for fast status ([review])
- Select the latest terminal testing state by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run directory name as a deterministic tie-breaker ([review])
- Mark cached evidence stale when any recorded staleness input differs from the current input ([review])

### NEVER

- Infer passing scope from testing last-run state ([review])
- Treat testing state as audit or review state without a shared storage ADR ([review])
