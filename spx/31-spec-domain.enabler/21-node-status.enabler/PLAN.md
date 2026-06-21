# Plan: 21-node-status.enabler

## Implementation (code layer)

The `spx.status.json` reader, writer, classifier, and evidence provider exist in `src/lib/node-status/`, with co-located `tests/` evidence for `node-status.md`; this node is not in `spx/EXCLUDE`. The remaining code-layer work, run through `/spec-tree:applying`, wires `spx spec status --update` (declared but unwired) to obtain each node's pass/fail outcome through the testing domain per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` and the read-versus-refresh split in `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`, replacing the status-owned `NodeTestRunner` with the testing-evidence-plus-registry resolver.

## Deferred: staleness detection

Staleness reporting is out of scope for this node's first implementation. The intended model, for a later node or amendment:

- Staleness is detected ex post during `spx spec status`; nothing is stored in `spx.status.json` to support it.
- A node's recorded status is stale when any of its transitive dependencies changed since the status was recorded: the chain spec to test to the implementation the tests import, followed transitively through that implementation's own imports.
- The comparison is computed at read time from the dependency graph and git history, not from a persisted anchor.

## Harness governance (queued)

Govern the still-ungoverned node-status test harness and generator per the **Remaining harness governance program** in `spx/PLAN.md` (approach, audit gates, literal-collision lessons). One PR — the smallest remaining batch.

Modules: `testing/harnesses/node-status/node-status.ts` and `testing/generators/node-status/node-status.ts` — place the governing node(s) beside this node.

Route: `/understand` → `/contextualize spx/31-spec-domain.enabler/21-node-status.enabler` → `/author` a per-module test-harness/generator enabler → `/apply` audit gates (spec-auditor + test-evidence-auditor, including the coverage gate) → `/merge`.
