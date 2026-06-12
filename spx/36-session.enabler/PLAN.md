# PLAN

## Plan A — Wire the spx CLI half of the session-scope accumulator

### Why this plan exists

The spec-tree plugin now specifies `.spx/sessions/$CLAUDE_SESSION_ID/` (or `$CODEX_THREAD_ID/` under Codex) as the authoritative accumulator for every session an agent has claimed during a runtime. The marketplace side is in place after commit `ad7d696`:

- `plugins/spec-tree/bin/session-start` no longer mkdirs the per-runtime directory. It is created lazily on first claim.
- `plugins/spec-tree/skills/handoff/references/scope-resolution.md` reads the filesystem as primary source of truth and cross-checks against `<SESSION_SCOPE>` / `<PICKUP_CHECKPOINT>` / `<PICKUP_CLAIM>` markers.
- `plugins/spec-tree/skills/pickup/SKILL.md` documents the dual accumulator (filesystem symlink + marker).

The corresponding `spx` CLI changes have not landed. Until they do, the filesystem source is empty on every runtime, the algorithm falls through to marker-based scope recovery, and context compaction still risks dropping scope — the exact failure mode this work eliminates.

This plan hands the CLI implementation off to an agent working in `~/Code/outcomeeng/spx/`.

### Target behavior

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

### Contract specifics

- **Symlink format**: relative, exactly `../doing/<id>.md`. A symlink ending in anything else is invalid and must be treated as a bug, not as data.
- **Dangling symlinks**: `spx session pickup` on a previously-dangling id must first remove the old symlink, then create the new one. Never overwrite without validating.
- **Runtime id collision**: if two conversations happen to produce the same `$CLAUDE_SESSION_ID` (should not occur — Claude session ids are per-conversation), the second pickup silently shares the same directory. This is acceptable degraded behavior; no special handling required.
- **File permissions**: the per-runtime directory and its symlinks inherit umask. Do not chmod explicitly.
- **Concurrency**: pickup and archive are already atomic at the queue level. The accumulator steps happen before/after the queue move — a crash between queue move and symlink create leaves a session in `doing/` without a symlink (scope-resolution.md's "markers are a superset of filesystem" case — the marker cross-check catches this). A crash between symlink remove and archive move leaves a symlink with a target in `archive/` (resolution: the filesystem step classifies it as "already archived" and skips it). Both are acceptable recovery paths.

### Work breakdown with audit gates

#### Step 1 — Spec the new behavior

**Target node**: `spx/41-validation.enabler/21-validation-cli.enabler/` already hosts the CLI dispatch spec. The session subcommands live under a different enabler — confirm by `/contextualizing spx/` in the `spx` repo on first entry.

1. Invoke `/contextualizing` on the target enabler under the `spx` repo's spec tree. Resolve the authoritative node.
2. Amend the spec to declare the two new assertions (pickup-creates-symlink, archive-removes-symlink) plus the per-session-dir scanning rule.
3. **Audit gate**: run `/auditing-product-decisions` on any PDR changes and `/aligning` across the affected subtree.

#### Step 2 — Tests first (TDD)

Per the spx repo's test-language ADR (TypeScript + Vitest), write tests in the target node's `tests/` directory following `<subject>.<evidence>.<level>[.<runner>].test.ts`:

- `pickup.scenario.l1.test.ts` — claim-then-inspect-symlink round-trip; $CLAUDE_SESSION_ID and $CODEX_THREAD_ID paths; neither-set degraded path.
- `archive.scenario.l1.test.ts` — archive-removes-own-symlink; archive-removes-cross-runtime-symlink (simulate second runtime directory); archive-of-untracked-id (no symlink exists).
- `accumulator.property.l1.test.ts` — property: for any sequence of pickup(id_i) and archive(id_i) operations with a fixed runtime id, the set `{readlink(S) for S in .spx/sessions/$RUNTIME_ID/}` equals the set of picked-up-but-not-yet-archived ids.
- `symlink-recovery.scenario.l1.test.ts` — pre-existing dangling symlink with a newly-claimed matching id; crash-between-move-and-symlink recovery.

**Audit gate**: run `/auditing-tests` (via `/spec-tree:test-evidence-auditor` agent) to confirm coupling, falsifiability, alignment, coverage. Every new test must pass the 4-property evidence check.

#### Step 3 — Implementation

- `src/commands/session/pickup.ts` (or wherever the handler lives) — add the resolve-runtime-id + mkdir -p + ln -sfn after the existing move.
- `src/commands/session/archive.ts` — add the scan-and-unlink step before the existing move.
- Factor the runtime-id resolution into a helper under `src/lib/` so other session commands can reuse it without duplicating env-var priority logic.

**Audit gate**: `spx validation all` in the spx repo after each file. Zero new findings.

#### Step 4 — End-to-end verification in the marketplace repo

Return to `~/Code/outcomeeng/plugins/`. Install the updated `spx` via `pnpm link`. Then:

1. In a fresh conversation, `/pickup` some test session. Verify `.spx/sessions/$CLAUDE_SESSION_ID/<id>.md` exists as a symlink pointing at `../doing/<id>.md`.
2. `/handoff`. Confirm workflow 04 resolves scope from the filesystem (the verdict output should name the symlink's id) and the symlink is removed after `spx session archive`.
3. Inspect `.spx/sessions/$CLAUDE_SESSION_ID/`. It must be empty or removed after closure.
4. Context-compaction test: claim a session, run `/compact`, then `/handoff`. Scope must still resolve correctly via the filesystem even though the `<SESSION_SCOPE>` marker is gone.

### Touch points in the marketplace repo

Nothing else to change here. The plugin-side contract is already merged. If the spx agent finds a drift between what this PLAN.md describes and what `references/scope-resolution.md` prescribes, the `references/scope-resolution.md` is authoritative — update this PLAN.md, not the reference.

### Pointers

- Marketplace commit implementing the plugin-side contract: `ad7d696`
- Authoritative algorithm: `plugins/spec-tree/skills/handoff/references/scope-resolution.md` (in the sibling `outcomeeng/plugins` repo)
- SessionStart hook (lazy-create expectation): `plugins/spec-tree/bin/session-start` (in the sibling `outcomeeng/plugins` repo)
- Current spx session command handlers (paths observed during plan drafting; confirm on entry): `src/commands/session/pickup.ts`, `src/commands/session/archive.ts`, `src/domains/session/index.ts`

---

## Plan B — Wire the spx CLI `compact-stash` / `compact-resume` commands

### Why this plan exists

The merged marketplace PR #154 moved post-compaction re-anchoring to **delegate to the spx CLI**. Two hooks in the sibling `outcomeeng/plugins` repo now shell out to commands that do not yet exist in this CLI:

- PreCompact (`src/plugins/spec-tree/scripts/pre-compact.py`) calls `spx session compact-stash --session-id <id> --transcript <path>`.
- PostCompact (`src/plugins/spec-tree/scripts/post-compact.py`) calls `spx session compact-resume --session-id <id>` and parses the JSON on stdout.

Until both commands ship, `pre-compact.py` no-ops and `post-compact.py` falls back to parsing the active node out of the compact summary (the section-scoped, backtick-tolerant parser already in the hook). Re-anchoring **degrades, it does not break** — so this is not urgent, but the deterministic transcript path stays dark until the commands land.

Stash storage/retrieval belongs in this CLI because `spx` already resolves `.spx/` correctly across a bare-repository worktree pool (`detectGitCommonDirProductRoot` returns both `productDir` and `worktreeRoot`) and has the multi-worktree test harness the plugins repo lacks. Governed plugin-side by `spx/21-spec-tree.enabler/76-sessions.enabler/21-compact-continuity.pdr.md` (in the plugins repo).

### Contract (already merged in the plugins repo; do NOT change — satisfy it)

Verified against the merged hook scripts at plugins `main` `39df4589`:

**`spx session compact-stash --session-id <id> --transcript <path>`** (called by PreCompact)

- The hook is fire-and-forget: `subprocess.run(..., check=False, capture_output=True)`, `OSError` swallowed. The hook ignores stdout/stderr and the exit code. Exit 0 on success and on no-op for cleanliness regardless.
- Resolve the session dir `<.spx>/sessions/<id>/`, where `<.spx>` comes from the existing `resolveSessionConfig` / `detectGitCommonDirProductRoot` (`src/git/root.ts:166`, `:373`). It MUST resolve to the **same shared** `.spx/sessions/<id>/` from a root worktree and from any linked worktree of a bare pool. `session_id` gives the per-conversation isolation; placement is shared, **not** worktree-local (the `local/` idea was explicitly rejected in the merged PDR).
- Read the transcript (JSONL). Markers appear JSON-string-escaped, e.g. `target=\"spx/...\"`. Extract:
  - `has_foundation` = the literal `SPEC_TREE_FOUNDATION` appears anywhere in the file.
  - `active_node` = the **last** match of `SPEC_TREE_CONTEXT target=\\?"(spx/[A-Za-z0-9._/-]+)` (tolerate the optional escaped quote; most-recent wins). May be empty.
- If `has_foundation` is false → no-op, exit 0 (nothing to re-anchor).
- Else → `mkdir -p` the session dir and write `compact-stash-<N>.json`, where N = (count of existing `compact-stash-*.json`) + 1, content `{"active_node": "<node-or-empty>", "has_foundation": true}`. One numbered record per compaction; never overwrite (the history is intentional).
- Empirically verified during plan drafting: a real transcript holds ~29 `SPEC_TREE_CONTEXT` and ~59 `SPEC_TREE_FOUNDATION` occurrences, escaped as `target=\"spx/...\"`.

**`spx session compact-resume --session-id <id>`** (called by PostCompact)

- The hook reads `result.returncode` and `result.stdout`: on non-zero exit **or** empty stdout it falls back to summary-parsing; otherwise `json.loads(result.stdout)` and reads `active_node` + `has_foundation`.
- Resolve the same `<.spx>/sessions/<id>/`, find the most recent `compact-stash-*.json` (highest N).
- None → exit non-zero / no output.
- Else → print the stash JSON to stdout: `{"active_node": "...", "has_foundation": true}`.

`$SPX_BIN` overrides the `spx` executable in both hooks (the plugin tests point it at a fake recording argv).

### Boundary (keep spx decoupled from the plugin's presentation)

spx owns `.spx/` resolution, session-dir placement, transcript marker extraction, numbering, and retrieval. spx does **not** emit the re-anchoring instruction prose or any `/spec-tree:*` skill name — the PostCompact hook formats that from the JSON. The stash is conversation-ephemeral (`.spx/` is gitignored); it must not enter the session queue (`todo`/`doing`/`archive`) or the durable tree. It lives under `.spx/sessions/<id>/` alongside — but distinct from — the per-session accumulator (Plan A above).

### Work breakdown with audit gates (run from a session rooted at this repo)

1. **Context.** `/understanding`, then `/contextualizing spx/36-session.enabler`. The two commands are session-CLI subcommands; decide node placement with `/decomposing` (likely a new child enabler under `36-session.enabler`, sibling to `76-session-cli.enabler`, or assertions added to an existing one — let the methodology decide, do not pre-judge).
2. **Spec.** Declare the assertions for both commands via `/authoring`. Cover: stash writes the last node from an escaped-marker transcript; no-op when the transcript has no foundation marker; successive writes number 1, 2, 3…; resume returns the latest and signals "none" (non-zero/empty) correctly; **the load-bearing assertion** — the stash resolves to the **same** shared `.spx/sessions/<id>/` from both a root worktree and a linked worktree of a bare pool.
3. **Audit gate.** `/audit-pdr` on any PDR change and `/aligning` across the affected subtree.
4. **Tests first (TDD).** vitest, under the target node's `tests/`, naming `<subject>.<evidence>.<level>[.<runner>].test.ts`. Use `createSessionGitDeps` (`testing/harnesses/session/harness.ts`) to simulate ROOT and LINKED worktree git contexts.
5. **Audit gate.** `/auditing-tests` (via `spec-tree:test-evidence-auditor`) — 4-property evidence check.
6. **Implement.** Command impls in `src/commands/session/`; register in `src/interfaces/cli/session.ts` (registration ~272-283); domain logic in `src/domains/session/`; paths from `src/config/defaults.ts` (`DEFAULT_CONFIG.sessions`).
7. **Audit gate.** `spx validation ts` (never bare `tsc`) + `/auditing-typescript`. Zero new findings.
8. **Ship.** `/committing-changes` then `/pr`. When done, report the exact command names, flags, stdout shape, and exit codes so the plugin hooks can be confirmed against the real surface.

### Cross-repo verification (back in `~/Code/outcomeeng/plugins/`)

After the commands land and `spx` is linked, exercise the real hooks: claim a session, `/compact`, confirm `compact-stash-1.json` is written under `.spx/sessions/<id>/`, and that PostCompact re-emits the `<SPEC-TREE_RESUMED active-node="..."/>` marker from the stash rather than the summary fallback.

### Pointers (verified at plugins `main` `39df4589` / spx `origin/main` `af23d86`)

- Plugin-side contract (do not change): `src/plugins/spec-tree/scripts/pre-compact.py`, `src/plugins/spec-tree/scripts/post-compact.py` (sibling `outcomeeng/plugins` repo).
- Governing PDR: `spx/21-spec-tree.enabler/76-sessions.enabler/21-compact-continuity.pdr.md` (plugins repo).
- This repo: `src/git/root.ts` (`detectGitCommonDirProductRoot:166`, `resolveSessionConfig:373`), `src/commands/session/handoff.ts` (command pattern), `src/interfaces/cli/session.ts` (subcommand registration), `src/config/defaults.ts`, `testing/harnesses/session/harness.ts`, `spx/36-session.enabler/43-session-store.enabler/tests/` (example tests). Runner: vitest (`vitest.config.ts`).
- This Plan B was prepped from a plugins-rooted session (claimed session `2026-06-10_16-10-38`); the implementation runs from a session rooted at this worktree.
