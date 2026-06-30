# Root Coordination Index

## Harness vocabulary guard

Before applying this plan to agent-facing surfaces or session-domain boundaries, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, configured agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; keep SPX handoff sessions, configured-agent sessions, and command-surface actors distinct.

This file is a coordination note for the top-down repair sequence. It is not product truth. Durable product behavior belongs in PDRs, ADRs, specs, tests, and implementation under the owning nodes.

Use this note to orient `/contextualize spx/` quickly, then follow the node-local `PLAN.md` files for details.

## Target Structure

```text
spx/
├── <methodology vocabulary PDR>
├── 23-spec-tree.enabler/
│   └── 24-materialization.enabler/
│       ├── 21-filesystem-git-backend.enabler/
│       └── 32-executable-operations.enabler/
├── 25-outcomeeng.enabler/
│   └── 31-changes.enabler/
├── 31-spec-domain.enabler/
└── future interface surfaces
```

- The methodology vocabulary PDR settles product-wide terms before implementation: durable map, node type, dependency order, decision reach, assertion/evidence vocabulary, state/status vocabulary, materialization, backend, consumer, and pending `surface`.
- `spx/23-spec-tree.enabler/` owns the Spec Tree logical foundation: node identity, dependency/order semantics, state/status semantics, projection, and logical operations.
- `spx/23-spec-tree.enabler/24-materialization.enabler/` owns backend materialization: current state, history, per-node metadata, evidence records, dependency inputs, and executable operation requests.
- `spx/23-spec-tree.enabler/24-materialization.enabler/21-filesystem-git-backend.enabler/` is the first materialization backend, binding tracked `spx/` files, Git history, local evidence, and status metadata to the materialization contract.
- `spx/25-outcomeeng.enabler/` owns Outcome Engineering methodology primitives.
- `spx/25-outcomeeng.enabler/31-changes.enabler/` owns the backend-neutral change model: maturity, product-qualified node anchors, refinement, query predicates, backend-qualified handles, and backend capability expectations.
- `spx/31-spec-domain.enabler/` is a consumer/interface adapter over the Spec Tree foundation. It does not own state, status, storage, or materialization semantics.
- CLI commands, session commands, hosted APIs, MCP, UI, and future interaction boundaries are surfaces over foundation or change models after the `surface` node kind exists.

## Ownership Summary

The foundation/materialization split and the changes model fit together as separate provider layers:

- Spec Tree foundation answers what the product tree is, how nodes relate, how state/status is derived, and how consumers read projections.
- Spec Tree materialization answers how a backend stores and retrieves current state, history, metadata, evidence, dependency inputs, and executable operation records.
- Outcome Engineering changes answer what a change record is, how under-refined intent becomes planned or implementation-ready work, and how records are queried across backends.
- Worktree files, hosted issue trackers, and future stores are backends for changes or materialization. They do not define the product model.
- Session files and commands remain governed by `spx/36-session.enabler` until a later decision rewrites or prunes that domain. No root plan text should create a compatibility bridge from sessions to changes.

## Sequencing

1. Settle the methodology vocabulary PDR, including whether `surface` becomes a product-wide node kind and how it relates to enablers and outcomes.
2. Update the Spec Tree filename grammar, kind registry, validation model, and naming-schema version before creating any `.surface` node.
3. Keep Spec Tree materialization work under `spx/23-spec-tree.enabler/**`.
4. Keep change-record schema, maturity, backend identity, product-qualified node anchors, query predicates, and backend capability details under `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md`.
5. Keep `spx/31-spec-domain.enabler/` as a consumer while foundation and materialization ownership move under `spx/23-spec-tree.enabler/**`.
6. Introduce worktree-backed changes only after the backend-neutral change model is settled.
7. Migrate CLI, session, hosted, MCP, or UI surfaces only after the model they expose exists and the `surface` node kind is valid.

## Detail Owners

- `spx/23-spec-tree.enabler/PLAN.md` owns logical foundation repair details.
- `spx/23-spec-tree.enabler/24-materialization.enabler/PLAN.md` owns the materialization contract details.
- `spx/23-spec-tree.enabler/24-materialization.enabler/21-filesystem-git-backend.enabler/PLAN.md` owns filesystem + Git backend details.
- `spx/23-spec-tree.enabler/24-materialization.enabler/32-executable-operations.enabler/PLAN.md` owns executable-operation request and evidence details.
- `spx/31-spec-domain.enabler/PLAN.md` owns consumer/interface-adapter cleanup details.
- `spx/25-outcomeeng.enabler/31-changes.enabler/PLAN.md` owns change-record model, backend, query, and future surface details.
- `spx/36-session.enabler/PLAN.md` owns session-domain cleanup or retirement details until a later decision changes that domain.

## Completion Criteria

- The methodology vocabulary PDR exists and is audited.
- `.surface` is either rejected as a node kind or accepted only after grammar, kind registry, validation, and naming-schema changes are in place.
- `spx/23-spec-tree.enabler/**` owns Spec Tree logical foundation and materialization semantics.
- `spx/31-spec-domain.enabler/` owns only consumer/interface-adapter behavior.
- `spx/25-outcomeeng.enabler/31-changes.enabler/` owns the backend-neutral changes model.
- Root coordination no longer duplicates node-local implementation plans or stale migration queues.
