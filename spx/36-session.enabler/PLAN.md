# PLAN: Wire the spx CLI half of the session-scope accumulator

## Why this plan exists

The spec-tree plugin now specifies `.spx/sessions/$CLAUDE_SESSION_ID/` (or `$CODEX_THREAD_ID/` under Codex) as the authoritative accumulator for every session an agent has claimed during a runtime. The marketplace side is in place after commit `ad7d696`:

- `plugins/spec-tree/bin/session-start` no longer mkdirs the per-runtime directory. It is created lazily on first claim.
- `plugins/spec-tree/skills/handing-off/references/scope-resolution.md` reads the filesystem as primary source of truth and cross-checks against `<SESSION_SCOPE>` / `<PICKUP_CHECKPOINT>` / `<PICKUP_CLAIM>` markers.
- `plugins/spec-tree/skills/picking-up/SKILL.md` documents the dual accumulator (filesystem symlink + marker).

The corresponding `spx` CLI changes have not landed. Until they do, the filesystem source is empty on every runtime, the algorithm falls through to marker-based scope recovery, and context compaction still risks dropping scope — the exact failure mode this work eliminates.

This plan hands the CLI implementation off to an agent working in `~/Code/outcomeeng/spx/`.

## Target behavior

**On every successful `spx session pickup`:**

```text
1. mv todo/<id>.md → doing/<id>.md          (existing behavior, unchanged)
2. Resolve $RUNTIME_ID:
     prefer $CLAUDE_SESSION_ID
     fall back to $CODEX_THREAD_ID
     if neither set → skip steps 3-4 (degraded, keep going)
3. mkdir -p .spx/sessions/$RUNTIME_ID/
4. ln -sfn ../doing/<id>.md .spx/sessions/$RUNTIME_ID/<id>.md
```

Relative symlink is deliberate — absolute paths break when the repo is checked out at a different root.

**On every successful `spx session archive <id>`:**

```text
1. For every directory D under .spx/sessions/ that is NOT todo/, doing/, archive/:
     if D/<id>.md exists → rm D/<id>.md
   (scan is necessary because the archiving runtime may differ from the claiming runtime)
2. mv doing/<id>.md → archive/<id>.md    (existing behavior, unchanged)
```

**Unchanged:** `spx session list`, `spx session show`, `spx session handoff`, `spx session release`, `spx session prune`, `spx session delete`, `spx session todo`.

## Contract specifics

- **Symlink format**: relative, exactly `../doing/<id>.md`. A symlink ending in anything else is invalid and must be treated as a bug, not as data.
- **Dangling symlinks**: `spx session pickup` on a previously-dangling id must first remove the old symlink, then create the new one. Never overwrite without validating.
- **Runtime id collision**: if two conversations happen to produce the same `$CLAUDE_SESSION_ID` (should not occur — Claude session ids are per-conversation), the second pickup silently shares the same directory. This is acceptable degraded behavior; no special handling required.
- **File permissions**: the per-runtime directory and its symlinks inherit umask. Do not chmod explicitly.
- **Concurrency**: pickup and archive are already atomic at the queue level. The accumulator steps happen before/after the queue move — a crash between queue move and symlink create leaves a session in `doing/` without a symlink (scope-resolution.md's "markers are a superset of filesystem" case — the marker cross-check catches this). A crash between symlink remove and archive move leaves a symlink with a target in `archive/` (resolution: the filesystem step classifies it as "already archived" and skips it). Both are acceptable recovery paths.

## Work breakdown with audit gates

### Step 1 — Spec the new behavior

**Target node**: `spx/41-validation.enabler/21-validation-cli.enabler/` already hosts the CLI dispatch spec. The session subcommands live under a different enabler — confirm by `/contextualizing spx/` in the `spx` repo on first entry.

1. Invoke `/contextualizing` on the target enabler under the `spx` repo's spec tree. Resolve the authoritative node.
2. Amend the spec to declare the two new assertions (pickup-creates-symlink, archive-removes-symlink) plus the per-session-dir scanning rule.
3. **Audit gate**: run `/auditing-product-decisions` on any PDR changes and `/aligning` across the affected subtree.

### Step 2 — Tests first (TDD)

Per the spx repo's test-language ADR (TypeScript + Vitest), write tests in the target node's `tests/` directory following `<subject>.<evidence>.<level>[.<runner>].test.ts`:

- `pickup.scenario.l1.test.ts` — claim-then-inspect-symlink round-trip; $CLAUDE_SESSION_ID and $CODEX_THREAD_ID paths; neither-set degraded path.
- `archive.scenario.l1.test.ts` — archive-removes-own-symlink; archive-removes-cross-runtime-symlink (simulate second runtime directory); archive-of-untracked-id (no symlink exists).
- `accumulator.property.l1.test.ts` — property: for any sequence of pickup(id_i) and archive(id_i) operations with a fixed runtime id, the set `{readlink(S) for S in .spx/sessions/$RUNTIME_ID/}` equals the set of picked-up-but-not-yet-archived ids.
- `symlink-recovery.scenario.l1.test.ts` — pre-existing dangling symlink with a newly-claimed matching id; crash-between-move-and-symlink recovery.

**Audit gate**: run `/auditing-tests` (via `/spec-tree:test-evidence-auditor` agent) to confirm coupling, falsifiability, alignment, coverage. Every new test must pass the 4-property evidence check.

### Step 3 — Implementation

- `src/commands/session/pickup.ts` (or wherever the handler lives) — add the resolve-runtime-id + mkdir -p + ln -sfn after the existing move.
- `src/commands/session/archive.ts` — add the scan-and-unlink step before the existing move.
- Factor the runtime-id resolution into a helper under `src/lib/` so other session commands can reuse it without duplicating env-var priority logic.

**Audit gate**: `spx validation all` in the spx repo after each file. Zero new findings.

### Step 4 — End-to-end verification in the marketplace repo

Return to `~/Code/outcomeeng/plugins/`. Install the updated `spx` via `pnpm link`. Then:

1. In a fresh conversation, `/picking-up` some test session. Verify `.spx/sessions/$CLAUDE_SESSION_ID/<id>.md` exists as a symlink pointing at `../doing/<id>.md`.
2. `/handing-off`. Confirm workflow 04 resolves scope from the filesystem (the verdict output should name the symlink's id) and the symlink is removed after `spx session archive`.
3. Inspect `.spx/sessions/$CLAUDE_SESSION_ID/`. It must be empty or removed after closure.
4. Context-compaction test: claim a session, run `/compact`, then `/handing-off`. Scope must still resolve correctly via the filesystem even though the `<SESSION_SCOPE>` marker is gone.

## Touch points in the marketplace repo

Nothing else to change here. The plugin-side contract is already merged. If the spx agent finds a drift between what this PLAN.md describes and what `references/scope-resolution.md` prescribes, the `references/scope-resolution.md` is authoritative — update this PLAN.md, not the reference.

## Pointers

- Marketplace commit implementing the plugin-side contract: `ad7d696`
- Authoritative algorithm: `plugins/spec-tree/skills/handing-off/references/scope-resolution.md` (in the sibling `outcomeeng/plugins` repo)
- SessionStart hook (lazy-create expectation): `plugins/spec-tree/bin/session-start` (in the sibling `outcomeeng/plugins` repo)
- Current spx session command handlers (paths observed during plan drafting; confirm on entry): `src/commands/session/pickup.ts`, `src/commands/session/archive.ts`, `src/domains/session/index.ts`
