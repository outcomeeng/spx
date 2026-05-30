# Plan: 54-spec-cli-commands.enabler — wire node-status into the CLI

This is the CLI half of PR alpha in `spx/31-spec-domain.enabler/PLAN.md`. The
node-status library (`src/lib/node-status`) merged with PR #72 (spec) and #74
(implementation). The `spx spec` command surface does not yet consume it.

## Two wiring gaps (surfaced by review on PR #74)

1. **Write path — `spx spec status --update` is unreachable.**
   `src/domains/spec/index.ts` registers only `--json`/`--format` for
   `spec status`; `spx spec status --update` exits with `unknown option`. This
   behavior is already specified (`spec-cli-commands.md` scenario "when
   `spx spec status --update` runs …" and the write-scope compliance rule), so
   this gap is pure implementation: register `--update`, invoke
   `updateNodeStatus({ productDir, runNodeTests })` from `src/commands/spec/`,
   and supply the real per-node test runner.

2. **Read path — `spx spec status` ignores persisted statuses.**
   `readCommandSnapshot` in `src/commands/spec/status.ts` calls
   `readSpecTree({ source })` without an evidence provider, so committed
   `failing`/`passing` states are discarded and tested nodes fall back to live
   `specified` derivation. The fix is to pass `createNodeStatusProvider(productDir)`
   as the `evidence` provider on the filesystem read path.

   **Spec gap:** `spec-cli-commands.md` does not yet assert that `spx spec status`
   honors a node's persisted `spx.status.json` when present. Line 11 says it
   reports "derived node states from the current spec-tree surface" — silent on
   persisted state. This needs a spec amendment (an assertion that a node with a
   committed status file reports that recorded state, and a node without one
   reports the live-derived state) BEFORE the read-path implementation.

## Ordering

Per the spec-then-implementation split: amend `spec-cli-commands.md` for the
read-path assertion first (its own spec PR), then implement both wiring gaps via
`/spec-tree:applying` on this node (architecture → tests → code, three audit
gates), with a covering scenario test under `tests/`.
