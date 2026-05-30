# Plan: 54-spec-cli-commands.enabler — wire node-status into the CLI

This is the CLI half of PR alpha in `spx/31-spec-domain.enabler/PLAN.md`. The
node-status library (`src/lib/node-status`) is merged on `main`. The `spx spec`
command surface does not yet consume it.

## Two wiring gaps

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

   The read-path behavior is now governed: `spec-cli-commands.md` carries the
   read-path scenario assertion (a node with a committed `spx.status.json`
   reports its recorded state and runs no tests) and a no-tests-on-read
   compliance rule, and `15-status-file-contract.pdr.md` carries the matching
   invariants. That scenario's `[test]` link is a forward contract: the covering
   test case is authored in this node's implementation unit alongside the
   provider wiring, not before it.

## Ordering

The read-path governance landed as a spec change (PDR invariants + the
`spec-cli-commands.md` assertion). The implementation unit then wires both gaps
via `/spec-tree:applying` on this node (architecture → tests → code, three audit
gates), authoring the covering scenario test under `tests/` as it wires the
provider and registers `--update`.
