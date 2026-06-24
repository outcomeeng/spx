# Plan: 21-node-status.enabler

## Deferred: staleness detection

Staleness reporting is out of scope for this node's first implementation. The intended model, for a later node or amendment:

- Staleness is detected ex post during `spx spec status`; nothing is stored in `spx.status.json` to support it.
- A node's recorded status is stale when any of its transitive dependencies changed since the status was recorded: the chain spec to test to the implementation the tests import, followed transitively through that implementation's own imports.
- The comparison is computed at read time from the dependency graph and git history, not from a persisted anchor.

## Harness governance (queued)

Govern the still-ungoverned node-status test harness and generator per the **Remaining harness governance program** in `spx/PLAN.md` (approach, audit gates, literal-collision lessons). One PR — the smallest remaining batch.

Modules: `testing/harnesses/node-status/node-status.ts` and `testing/generators/node-status/node-status.ts` — place the governing node(s) beside this node.

Route: `/understand` → `/contextualize spx/31-spec-domain.enabler/21-node-status.enabler` → `/author` a per-module test-harness/generator enabler → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
