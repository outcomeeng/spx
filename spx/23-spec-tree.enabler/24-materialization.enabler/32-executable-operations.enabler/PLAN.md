# Plan: Executable operations

> **Reconcile against `spx/PLAN.md` first.** This lives under the `backend` layer ("materialization" is renamed `backend`), orthogonal to `persistence` (records / journals / snapshots) and `delivery`. Where this note predates that model, the root plan governs.

This placeholder coordination note records the executable-operation node before `/decompose` and `/author` create durable specs and decisions.

## Purpose to author

`spx/23-spec-tree.enabler/24-materialization.enabler/32-executable-operations.enabler` should define the backend-neutral operation contract for verification and evidence refresh.

The node should cover:

- requesting verification for a node or evidence set
- recording whether an operation ran locally, remotely, from cache, or not at all
- storing operation results as evidence records
- returning unsupported-operation diagnostics
- connecting backend operation requests to provider domains such as testing

## Provider boundary

The operation contract should request and record work. Runner mechanics stay with `spx/41-test.enabler`; language-specific expansion stays with language descriptors.

## Examples to preserve

- Filesystem backend can execute local `spx test` paths and record `.spx/worktree/test/runs/*.jsonl`.
- A GitHub-backed backend could read check runs or trigger workflow dispatch instead of local execution.
- A Linear-backed materialization could attach externally supplied evidence and report local execution unsupported.

## Questions for `/decompose`

- Does executable operation state belong in the same materialization child as static state and history, or as a sibling under `spx/23-spec-tree.enabler`?
- Which operation vocabulary belongs in the top-level methodology PDR versus this node?
