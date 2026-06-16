# Plan: GitHub CI Integration

## Purpose

Group GitHub Actions integration for agentic verdict-mode runs: the Snapshot journal backend and the audit and review CI entrypoints.

## Composition

`github-ci` holds two child concerns:

- `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler` — binds the journal's `JournalBackend` port as its Snapshot kind to reach GitHub surfaces; the provider.
- Audit-in-CI capstone — reserved at index ~65, a consumer of the Snapshot adapter that runs the audit and review domains under GitHub Actions and persists each run through the adapter.

The provider/consumer edge (adapter -> capstone) sets the index order: the adapter is lower, the capstone higher. The capstone runs spx's own domains in CI — self-application, not a spec-tree edge — so it is wired here as CI integration, never modeled as the audit or review domain depending on itself.

## Sibling placement

`43-github-ci.enabler` shares index 43 with `spx/21-infrastructure.enabler/43-precommit.enabler`: the two are independent infrastructure peers with no provider/consumer edge, so they are same-index siblings. `github-ci` reads `spx/21-infrastructure.enabler/32-dependency-updates.enabler` as lower-index context only and asserts no consumer relationship over it. The cross-parent provider edge is on `spx/15-agent-run-journal.enabler`, whose `JournalBackend` port this node binds as the Snapshot kind.

## Governing specs

- `spx/21-infrastructure.enabler/infrastructure.md`
- `spx/15-agent-run-journal.enabler/agent-run-journal.md`
- `spx/15-agent-run-journal.enabler/21-event-sourced-journal.adr.md`
- `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md`

## Snapshot adapter implementation notes

- Bind the journal's `JournalBackend` port as the Snapshot kind from this node's GitHub-CI integration module, per `spx/15-agent-run-journal.enabler/32-journal-module-structure.adr.md`. The adapter holds all GitHub API and Actions-runtime access behind an injected client.
- A Snapshot sink is write-only with no per-append read, so the journal's append-history O(n^2) follow-up in `spx/15-agent-run-journal.enabler/ISSUES.md` does not apply to this backend.
- The per-surface write mechanism for each GitHub surface is decided during the adapter's implementation, in a decision record co-located with the adapter.
