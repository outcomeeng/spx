# PLAN

> **Reconcile against `spx/PLAN.md` first.** This node is the backend-neutral exemplar for durable change records: build `change-store` + its worktree records backend + `.spx/changes/` scope addressing before the `.surface` CLI, which is deferred until SPX supports configured node kinds, methodology context injection, and target suffix readiness. Treat durable records as persistence-capability inventory until a reviewed receiver and ordering evidence settle its final shape. Where this note predates the root plan, the root plan governs.

## Harness vocabulary guard

Before applying this plan to agent-authored change intake, agent-facing surfaces, or session boundaries, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Backend-neutral changes and surfaces

### Purpose

This coordination note tracks the remaining structure and implementation work for the changes domain. Durable change-store behavior lives in `spx/25-outcomeeng.enabler/31-changes.enabler/21-change-store.pdr.md` and `spx/25-outcomeeng.enabler/31-changes.enabler/changes.md`.

### Durable decisions

- External Outcome Engineering methodology owns methodology vocabulary, and root `spx/PLAN.md` coordinates when SPX consumes that vocabulary locally.
- `spx/25-outcomeeng.enabler/31-changes.enabler/21-change-store.pdr.md` owns the backend-neutral change model, dependency and priority semantics, worktree status vocabulary, and session boundary.

### Pending structure work

Run `/decompose` before authoring the next structure change. The intended candidates are:

- `spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler` for the worktree-backed change store.
- A future CLI surface node for `spx change` commands after `.surface` is valid.
- A future placement decision for `spx/31-spec-domain.enabler` after `.surface` is valid.

Session-domain cleanup stays under `spx/36-session.enabler/PLAN.md` until a later decision changes that domain.

### First implementation slice

Sequencing per the root `spx/PLAN.md` and the reconciliation header above: `.surface` is deferred. The first executable slice is:

1. Extend `spx/18-state.enabler/32-scope-addressing.enabler` with `.spx/changes/` shared scope addressing before implementing the worktree backend.
2. Create `spx/25-outcomeeng.enabler/31-changes.enabler/29-changes-worktree.enabler`.
3. Implement the change-store fields and query semantics governed by `spx/25-outcomeeng.enabler/31-changes.enabler/21-change-store.pdr.md`.

### Parked surface slice

Re-enter this slice only after SPX supports configured node kinds, methodology context injection, and target suffix readiness:

1. Update the spec-tree filename grammar, kind registry, validation model, and naming-schema version so `.surface` is a recognized canonical node suffix.
2. Add the `surface` node type to the configured methodology after the grammar can recognize it.
3. Create the future CLI surface node for `spx change` commands.
4. Expose change records through JSON and text surfaces after the CLI surface exists.

### Open structure questions

- Whether `spx/31-spec-domain.enabler` moves under `spx/45-cli.surface` in the same node-type migration or in a later slice.
- Whether `spx/36-session.enabler` remains independently governed until pruned, or is rewritten after changes exist.
