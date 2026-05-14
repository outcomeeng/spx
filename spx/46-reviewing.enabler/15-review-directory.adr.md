# Review Directory Structure

## Purpose

This decision governs how local review run state and reviewer artifacts are named and organized on disk under `.spx/review/`.

## Context

**Business impact:** Agents and developers need local review evidence for branch and pull request targets without sharing mutable state with the invoking agent. Review runs must be inspectable by target so status commands can report the latest local review evidence without re-running reviewers.

**Technical constraints:** Review state is gitignored local state. It follows the worktree resolution rules in `spx/15-worktree-resolution.pdr.md`, and it stays separate from audit state unless a dedicated storage decision unifies the two domains.

## Decision

Review run state is stored under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}/` at the Git common-dir product root.

`target-kind` is either `branch` or `pr`. Branch target slugs use the same filesystem-safe slugging rules and implementation as audit branch slugs in `spx/36-audit.enabler/15-audit-directory.adr.md`. Pull request target slugs use `pr-{number}` where `{number}` is the decimal pull request number resolved by the review target boundary. All target slugs are at most 120 UTF-8 bytes. Pull request numbers are unsigned base-10 integers; no sign, decimal point, separator, or leading whitespace is accepted.

Each run directory contains a terminal `state.json` file and reviewer output artifacts. `state.json` records the target kind, target slug, reviewer identifiers, base/head metadata, review config digest, run timestamps, output paths, and terminal status. A run directory without parse-valid `state.json` is incomplete review evidence and cannot satisfy latest terminal review lookup.

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

The latest terminal review for a target is selected from parse-valid `state.json` files by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run directory name as a deterministic tie-breaker.

## Rationale

Separating review state under `.spx/review/` keeps review evidence distinct from audit verdict evidence while preserving the same local-state lifecycle model. The target-kind segment prevents branch and pull request targets from colliding, and the target slug keeps latest-review lookup local to one reviewable unit.

## Trade-offs accepted

| Trade-off                                      | Mitigation / reasoning                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Review and audit use separate local-state roots | The domains have different artifacts and lifecycle semantics; a shared root requires its own ADR    |
| Pull request slugs depend on resolved metadata | PR target metadata is already required for `spx review pr <number>` and is recorded in `state.json` |

## Invariants

- Review state is grouped by target kind and target slug before run history is inspected
- Target slugs stay within the 120-byte component limit and use the shared audit/review branch slug implementation for branch targets
- Incomplete review run directories cannot satisfy latest terminal review lookup
- Latest terminal review lookup orders terminal runs by `state.json` timestamps before using directory names as a tie-breaker
- Audit verdict state and review state are not interchangeable without a shared storage ADR

## Compliance

### Recognized by

A state file at `.spx/review/branch/work-config-backed-execution-scope-1a2b3c4d/runs/2026-04-25_15-45-00-123-a1b2c3d4e5f6/state.json`.

### MUST

- Store review run state under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}/` at the Git common-dir product root ([review](../15-worktree-resolution.pdr.md))
- Use `branch` and `pr` as the only target-kind directory names ([review])
- Reuse the audit branch slug implementation for branch review target slugs ([review](../36-audit.enabler/15-audit-directory.adr.md))
- Keep target slugs at or below 120 UTF-8 bytes ([review])
- Encode pull request target slugs as `pr-{number}` using an unsigned base-10 pull request number ([review])
- Store target kind, target slug, reviewer identifiers, base/head metadata, review config digest, run timestamps, output paths, and terminal status in `state.json` ([review])
- Treat run directories without parse-valid `state.json` as incomplete evidence for latest-review lookup ([review])
- Select the latest terminal review by greatest `completedAt`, then greatest `startedAt`, then lexicographically greatest run directory name as a deterministic tie-breaker ([review])

### NEVER

- Store review run state under `.spx/audit/` without a shared audit/review storage ADR ([review])
- Treat audit state files as review state files without a shared audit/review storage ADR ([review])
