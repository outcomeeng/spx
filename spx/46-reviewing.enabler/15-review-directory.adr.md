# Review Directory Structure

Review run state is stored under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` for branch targets and `.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl` for pull-request targets at the Git common-dir product root (per `spx/15-worktree-management.pdr.md`). Branch target slugs use the state-store branch-slug implementation of `spx/34-state-store.enabler/`, and pull-request target slugs are `pr-{number}` with `{number}` an unsigned base-10 pull request number (no sign, decimal point, separator, or whitespace). Each run file holds one terminal JSONL state record; a run file without a parse-valid record is incomplete evidence and cannot satisfy latest-terminal-review lookup. `baseSha` is recorded when the base ref resolves to a commit SHA before reviewer execution and omitted only when the base ref cannot be resolved within the local hermetic review boundary; `headSha` is always recorded because the reviewed target is pinned to a concrete head commit. The latest terminal review for a target is selected from parse-valid JSONL records by greatest `completedAt`, then greatest `startedAt`, then the lexicographically greatest run file name as a deterministic tie-breaker. The JSONL record conforms to:

```ts
interface ReviewRunState {
  readonly targetKind: "branch" | "pr";
  readonly targetSlug: string;
  readonly targetDisplayName: string;
  readonly reviewers: readonly string[];
  readonly baseRef: string;
  readonly baseSha?: string;
  readonly headSha: string;
  readonly reviewConfigDigest: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outputPaths: readonly string[];
  readonly status: "approved" | "rejected" | "failed" | "interrupted";
}
```

## Rationale

Storing review state under the shared branch scope keeps review evidence aligned with the reviewable unit while preserving separation through the `review` domain noun. Pull-request targets use a `pr-` branch-scope slug so branch and pull-request targets cannot collide, and every target's latest-review lookup stays local to one reviewable unit.

## Invariants

- Review state is grouped by branch-scope slug before run history is inspected.
- Target slugs stay within the 120-byte component limit and use the shared state-store branch-slug implementation for branch targets.
- Incomplete review run files cannot satisfy latest-terminal-review lookup.
- Latest-terminal-review lookup orders terminal runs by JSONL record timestamps before using file names as a tie-breaker.
- Audit verdict state and review state share branch scope but remain separated by domain noun.

## Verification

### Audit

- ALWAYS: store branch review run state under `.spx/branch/{branch-slug}/review/runs/run-{run-token}.jsonl` at the Git common-dir product root, per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: store pull-request review run state under `.spx/branch/pr-{number}/review/runs/run-{run-token}.jsonl` at the Git common-dir product root, per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: reuse the state-store branch-slug implementation for branch review target slugs, per `spx/34-state-store.enabler/` ([audit])
- ALWAYS: keep target slugs at or below 120 UTF-8 bytes ([audit])
- ALWAYS: encode pull-request target slugs as `pr-{number}` using an unsigned base-10 pull request number ([audit])
- ALWAYS: store target kind, target slug, target display name, reviewer identifiers, base/head metadata, review config digest, run timestamps, output paths, and terminal status in the JSONL record ([audit])
- ALWAYS: record `baseSha` when the base ref resolves to a commit SHA before reviewer execution; omit `baseSha` only when the base ref cannot be resolved inside the local hermetic review boundary ([audit])
- ALWAYS: record `headSha` for the reviewed target ([audit])
- ALWAYS: treat run files without parse-valid JSONL records as incomplete evidence for latest-review lookup ([audit])
- ALWAYS: select the latest terminal review by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run file name as a deterministic tie-breaker ([audit])
- NEVER: store review run state under `.spx/branch/{branch-slug}/audit/` or a root-level `.spx/review/` directory ([audit])
- NEVER: treat audit domain records as review domain records even though both share branch scope ([audit])
