# Plan: Filesystem and Git backend

This placeholder coordination note records the current backend node before `/decompose` and `/author` create durable specs and decisions.

## Purpose to author

`spx/23-spec-tree.enabler/24-materialization.enabler/21-filesystem-git-backend.enabler` should define the filesystem materialization of the spec-tree foundation.

The backend should provide:

- tracked `spx/` files as current state
- Git history as the history source
- `.spx/worktree/` as local execution evidence state
- `spx.status.json` as per-node filesystem metadata
- stale-file sweep behavior for node-shaped directories without tracked files
- status metadata read/write mechanics
- dependency-path comparison through Git history

## Facts to preserve from the node-status branch

- Status stale projection compares dependency paths against the co-located status file.
- `spx/EXCLUDE` changes affect status freshness.
- Missing `spx.status.json` routes to live derivation.
- Stale metadata never changes lifecycle state.
- A node-shaped directory with no tracked file should not receive status metadata.

## Product boundary

`spx.status.json` stores filesystem backend metadata. It is not the owner of lifecycle vocabulary, state semantics, or product methodology.

## Questions for `/decompose`

- Does status-file schema live entirely here, or does generic node metadata live one level up with JSON as this backend's encoding?
- Does Git-history comparison belong here or in the parent materialization contract as a required capability?
- How does a non-Git backend provide equivalent history and stale/fresh evidence?
