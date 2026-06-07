# Review Directory Structure

Review run state is stored under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}/` at the Git common-dir product root (per `spx/15-worktree-resolution.pdr.md`), where `target-kind` is either `branch` or `pr`: branch target slugs reuse the audit branch-slug implementation of `spx/36-audit.enabler/15-audit-directory.adr.md`, and pull-request target slugs are `pr-{number}` with `{number}` an unsigned base-10 pull request number (no sign, decimal point, separator, or whitespace). All target slugs are at most 120 UTF-8 bytes. Each run directory holds a terminal `state.json` plus reviewer output artifacts; a run directory without a parse-valid `state.json` is incomplete evidence and cannot satisfy latest-terminal-review lookup. `baseSha` is recorded when the base ref resolves to a commit SHA before reviewer execution and omitted only when the base ref cannot be resolved within the local hermetic review boundary; `headSha` is always recorded because the reviewed target is pinned to a concrete head commit. The latest terminal review for a target is selected from parse-valid `state.json` files by greatest `completedAt`, then greatest `startedAt`, then the lexicographically greatest run-directory name as a deterministic tie-breaker. `state.json` conforms to:

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

Storing review state under `.spx/review/` keeps review evidence distinct from audit verdict evidence while preserving the same local-state lifecycle model; the target-kind segment prevents branch and pull-request targets from colliding, and the target slug keeps latest-review lookup local to one reviewable unit. Review and audit use separate local-state roots because the domains have different artifacts and lifecycle semantics — a shared root would require its own ADR.

## Invariants

- Review state is grouped by target kind and target slug before run history is inspected.
- Target slugs stay within the 120-byte component limit and use the shared audit/review branch-slug implementation for branch targets.
- Incomplete review run directories cannot satisfy latest-terminal-review lookup.
- Latest-terminal-review lookup orders terminal runs by `state.json` timestamps before using directory names as a tie-breaker.
- Audit verdict state and review state are not interchangeable without a shared storage ADR.

## Verification

### Audit

- ALWAYS: store review run state under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}/` at the Git common-dir product root, per `spx/15-worktree-resolution.pdr.md` ([audit])
- ALWAYS: use `branch` and `pr` as the only target-kind directory names ([audit])
- ALWAYS: reuse the audit branch-slug implementation for branch review target slugs, per `spx/36-audit.enabler/15-audit-directory.adr.md` ([audit])
- ALWAYS: keep target slugs at or below 120 UTF-8 bytes ([audit])
- ALWAYS: encode pull-request target slugs as `pr-{number}` using an unsigned base-10 pull request number ([audit])
- ALWAYS: store target kind, target slug, reviewer identifiers, base/head metadata, review config digest, run timestamps, output paths, and terminal status in `state.json` ([audit])
- ALWAYS: record `baseSha` when the base ref resolves to a commit SHA before reviewer execution; omit `baseSha` only when the base ref cannot be resolved inside the local hermetic review boundary ([audit])
- ALWAYS: record `headSha` for the reviewed target ([audit])
- ALWAYS: treat run directories without parse-valid `state.json` as incomplete evidence for latest-review lookup ([audit])
- ALWAYS: select the latest terminal review by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run-directory name as a deterministic tie-breaker ([audit])
- NEVER: store review run state under `.spx/audit/` without a shared audit/review storage ADR ([audit])
- NEVER: treat audit state files as review state files without a shared audit/review storage ADR ([audit])
