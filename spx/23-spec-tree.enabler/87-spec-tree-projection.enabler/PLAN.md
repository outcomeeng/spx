# Plan: Projection contract review

This coordination note records projection work opened by the foundation restructure.

## Current role

`spx/23-spec-tree.enabler/87-spec-tree-projection.enabler` provides stable projection output for spec-tree snapshots.

## Required review

Projection should expose logical foundation state for consumers without leaking backend implementation details.

Review whether projection needs:

- generic node metadata slots
- stale/fresh status metadata
- backend capability metadata
- executable operation availability
- prototype/deployment flag state
- interface-neutral diagnostics

## Boundary rules

- Projection keys are logical contract fields.
- Filesystem paths, Git commands, and `spx.status.json` schema details stay in the filesystem backend.
- CLI, web API, MCP, and UI renderers consume the same projection contract where possible.

## Next action

After materialization and state model boundaries are settled, update projection assertions and tests to carry only logical fields consumers need.
