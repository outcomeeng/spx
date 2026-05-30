# Plan: 21-node-status.enabler

## Implementation (next PR)

This node is declared — spec and decision authored, no tests or implementation yet — and listed in `spx/EXCLUDE`. The implementation PR runs `/spec-tree:applying` on this node: author the `tests/` evidence for the assertions in `node-status.md`, implement the `spx.status.json` reader, writer, and classification in the spec-domain library, wire `spx spec status --update` per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/spec-cli-commands.md`, then remove the `spx/EXCLUDE` entry once tests pass.

## Deferred: staleness detection

Staleness reporting is out of scope for this node's first implementation. The intended model, for a later node or amendment:

- Staleness is detected ex post during `spx spec status`; nothing is stored in `spx.status.json` to support it.
- A node's recorded status is stale when any of its transitive dependencies changed since the status was recorded: the chain spec to test to the implementation the tests import, followed transitively through that implementation's own imports.
- The comparison is computed at read time from the dependency graph and git history, not from a persisted anchor.
