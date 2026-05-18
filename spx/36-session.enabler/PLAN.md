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

---

# PLAN: Execute PDR-11 session frontmatter shape <!-- markdownlint-disable-line MD025 -->

## Why this plan exists

[`spx/36-session.enabler/11-session-frontmatter.pdr.md`](11-session-frontmatter.pdr.md) declares the canonical session frontmatter shape and its lifecycle. Five child specs have been amended to cite the PDR and to declare the per-command behaviors that follow from it. Tests and implementation have not been updated. Until they are, the test suite green-lights the previous shape while specs declare the new one — the lower layer is in violation per the truth-flows-down rule.

Four [test]-tagged spec assertions reference test files that do not yet exist (canonical filenames). The owning nodes are listed in `spx/EXCLUDE` so markdown validation tolerates the forward references. EXCLUDE entries must be removed as the test files land.

## Touch points

### Specs (already amended in this plan's first commit)

- [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](11-session-frontmatter.pdr.md) — the PDR itself
- [`43-session-store.enabler/session-store.md`](43-session-store.enabler/session-store.md)
- [`32-session-identity.enabler/session-identity.md`](32-session-identity.enabler/session-identity.md)
- [`54-auto-injection.enabler/auto-injection.md`](54-auto-injection.enabler/auto-injection.md)
- [`54-session-retention.enabler/session-retention.md`](54-session-retention.enabler/session-retention.md)
- [`76-session-cli.enabler/session-cli.md`](76-session-cli.enabler/session-cli.md)

### Tests (Phase 2)

- `git mv` legacy `.unit.test.ts` / `.integration.test.ts` filenames to canonical `<subject>.<evidence>.<level>[.<runner>].test.ts` per `spx/local/typescript-tests.md`
- Author `testing/generators/session/` with at least:
  - `arbitraryValidSessionInstant` (Date arbitrary spanning a representative range)
  - `arbitraryNonFrontMatterContent` (`fc.string()` filtered to inputs whose first three characters are not `---`)
  - `arbitraryRetentionFixture(todoCount, doingCount, archiveCount, keep)`
  - `arbitraryArchiveFixture` (mix of parsable and unparsable IDs)
  - `arbitraryBatchInputs(n, validCount)` (variadic CLI inputs)
- Re-author every property assertion in the amended specs as `fc.assert(fc.property(<generator>, <predicate>))` — no handpicked-example masquerade
- Re-author every CLI scenario in `76-session-cli.enabler` to run through `node bin/spx.js` via `execa` with exit-code checks; remove direct `archiveCommand({...})` / `releaseCommand({...})` calls that bypass the Commander binding
- Strengthen `43-session-store.enabler` A1/A10/A11: read the on-disk file using `harness.statusDir(...)` and the emitted `<HANDOFF_ID>`; exercise `showCommand` and `deleteCommand` directly with real filesystem effects
- Author the enforcement mechanism for `session-store.md` compliance "no string literal frontmatter key at any call site" as a custom ESLint rule modeled on `eslint-rules/no-test-owned-domain-constants`. The rule flags quoted key strings outside `SESSION_FRONT_MATTER`'s definition module at edit time, which catches violations earlier than a grep-based compliance test would (the grep variant is rejected; it only catches at CI time). Author a sibling ADR at `spx/36-session.enabler/<next-index>-frontmatter-key-enforcement.adr.md` declaring the rule, and have the session-store compliance item cite the ADR. The test file `tests/session-store.compliance.l1.test.ts` exercises the rule against violating source-shaped fixtures

### Implementation (Phase 2)

- `src/domains/session/types.ts` — extend `SESSION_FRONT_MATTER` with `BRANCH`, `WORKTREE`, `GOAL`, `NEXT_STEP`, `RESULT`; remove `TAGS`; update `SessionMetadata` interface. YAML keys use underscore form (`next_step`); the TypeScript `SessionMetadata` interface uses the snake_case `next_step` key so `SESSION_FRONT_MATTER.NEXT_STEP` maps 1:1 to the YAML field name (consistent with `agent_session_id` and `created_at`)
- `src/domains/session/list.ts` — `parseSessionMetadata` returns `specs: []` and `files: []` when keys are missing or malformed; parses new string fields with `""` defaults; drops `tags` from the return shape
- `src/commands/session/handoff.ts` — drop the `buildSessionContent` default-substitution branch; validate non-empty `goal` and `next_step` from parsed YAML; prefill `branch` from `git rev-parse --abbrev-ref HEAD` and `worktree` from the helper introduced in `src/git/root.ts`; reject empty content with `SessionInvalidContentError`
- `src/commands/session/archive.ts` — read the session's `result` field through `SESSION_FRONT_MATTER.RESULT`; reject with `SessionInvalidResultError` when empty or absent; perform the move only after the result check passes. The two-step archive workflow (edit session file to populate `result`, then invoke `spx session archive`) is surfaced in the CLI help text for `spx session archive` so callers encounter the sequence before hitting the error
- `src/git/root.ts` — add `computeRelativeWorktreePath(commonDir, toplevel): string` returning the relative path from the common-dir parent to the worktree root, or `""` for non-worktree repos
- `src/domains/session/errors.ts` — add `SessionInvalidGoalError`, `SessionInvalidNextStepError`, `SessionInvalidResultError`, and `SessionDetachedHeadError`; keep `SessionInvalidContentError` for the genuinely-empty case
- `src/commands/session/show.ts` and the list renderer — surface `goal`, `next_step`, `result`, `branch`, `worktree` in display output; tolerate missing fields by rendering empty strings

### Validation gates

After each step, run `spx validation all` and `pnpm test` per the repo's pre-commit checklist. Phase 2 is complete when:

- Every test file uses canonical naming
- Every property assertion drives off a generator under `testing/generators/session/`
- Every CLI scenario asserts through `node bin/spx.js`
- `spx test passing` includes the four EXCLUDE-listed nodes again
- `spx/EXCLUDE` no longer lists `36-session.enabler/32-session-identity.enabler`, `36-session.enabler/54-auto-injection.enabler`, `36-session.enabler/54-session-retention.enabler`, or `36-session.enabler/76-session-cli.enabler`
- `pnpm run validate` and `pnpm test` pass against the updated implementation

### Acceptance

- `spx session handoff` with empty stdin exits non-zero with `SessionInvalidContentError`
- `spx session handoff` with content omitting `goal` exits non-zero with `SessionInvalidGoalError`
- `spx session archive` on a session with empty `result` exits non-zero with `SessionInvalidResultError`
- `spx session list` renders `goal` and `next_step` for every session this PDR governs
- A session whose frontmatter lacks structured fields still renders through `list`, `show`, `pickup`, and `release` without error
- `pnpm run publish:check` passes
