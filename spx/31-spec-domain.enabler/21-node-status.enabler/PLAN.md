# Plan: Evacuate node-status business logic

> **Reconcile against `spx/PLAN.md` first.** Status/state semantics evacuate to spec-tree (`node-state` derivation) and to `persistence` via `backend` (the rename of "materialization"). The corrected model separates `persistence` (records / journals / snapshots) from `backend` and `delivery`, and requires additive migration (never a wholesale move). Where this note predates that model, the root plan governs.

This coordination note records that `spx/31-spec-domain.enabler/21-node-status.enabler` is the wrong long-term owner for state, status, stale, and status-file semantics.

## Node-status changeset disposition

The node-status staleness implementation should not merge in its present ownership shape.

Preserve as evidence inventory:

- `spx/EXCLUDE` affects status freshness.
- TypeScript runtime import extensions affect product-input discovery.
- CommonJS `require`, dynamic `import`, `import type`, and import-equals forms affect TypeScript product-input discovery.
- Root-level relative imports affect TypeScript product-input discovery.
- Stale status is metadata and does not change lifecycle state.

Discard as architecture:

- TypeScript dependency graph walking inside `src/lib/node-status/`
- status dependency graph ownership inside spec-domain
- filesystem status-file schema ownership inside spec-domain
- CLI command path as orchestration owner

## Target role

Spec-domain should consume spec-tree status operations and render the result for interfaces. This node may disappear, shrink to interface behavior, or become a spec-domain adapter node after the provider responsibilities move.

## Move candidates

| Current concern             | Target owner                                                                     |
| --------------------------- | -------------------------------------------------------------------------------- |
| Lifecycle/state vocabulary  | `spx/23-spec-tree.enabler/76-node-state-derivation.enabler` plus methodology PDR |
| Stale/fresh semantics       | `spx/23-spec-tree.enabler` logical foundation                                    |
| Status dependency inputs    | materialization contract plus testing provider                                   |
| `spx.status.json` schema    | filesystem backend child                                                         |
| TypeScript import expansion | TypeScript testing descriptor path                                               |
| CLI status rendering        | `spx/31-spec-domain.enabler/32-spec-cli-rendering.enabler` or command child      |

## Next action

Do not add more implementation under this node until the provider and backend nodes exist. Use this node only to guide migration and to remove consumer-owned business logic.

## Claim-side of the test verification recording program

The full, all-slice plan lives in `spx/34-verification.enabler/PLAN.md` ("Program: test verification recording and claim"). This node owns the claim-side work; the summary below is its share, reconciled against this node's evacuation intent above (the authored-status contract may ultimately land in the future backend/spec-tree home, not here).

**Slice 1 (additive fold).** `spx spec status --update` gains a fold path beside the existing one: it reads the per-reference evidence a verification run recorded in the run journal — streamed there by the custom Vitest reporter, per `spx/34-verification.enabler/PLAN.md` — and folds real per-reference outcomes into `spx.status.json`, mapping test file → node via existing spec-tree evidence references. A covered reference whose evidence is stale keeps its committed outcome; an uncovered reference is `not-run`. It **executes nothing** — the relic where `--update` re-runs per-node tests (`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`) is what this replaces. The snapshot store is a projection derived from that recorded evidence, off the test evidence path.

**Slice 2 (authored lifecycle status; retire `spx/EXCLUDE`).**

- `spx.status.json` carries an **authored** lifecycle field (`declared`/`specified`) beside the machine-folded per-reference evidence outcomes: the author owns the lifecycle intent; `--update` owns the evidence.
- `--update` folds evidence but **never overwrites the authored lifecycle status**; a `specified` node stays `specified` when evidence is absent or failing, never downgraded to `failing`.
- The verification run and discovery **skip** nodes authored `declared`/`specified` — no wasted discovery, no failing record for absent implementations.
- CI honors the authored status: `declared`/`specified` nodes are not run and pass the gate; CI reproduces/refutes only nodes whose authored status expects passing.
- **`spx/EXCLUDE` is removed** — the per-node claim scopes the gate in its own committed record.
- Governed by `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` and `spx/31-spec-domain.enabler/21-node-status.enabler/21-node-status-architecture.adr.md`; the `CLAUDE.md` no-hand-edit rule updates so the lifecycle field is authorable while `passed`/`failed`/`not-run` evidence values stay machine-only.
