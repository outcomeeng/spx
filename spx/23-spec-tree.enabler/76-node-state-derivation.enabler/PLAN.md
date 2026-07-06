# Plan: State model expansion

> **Reconcile against `spx/PLAN.md` first.** The root plan treats current paths as inventory, projects substrate / capability / domain / interface / surface area roles, parks target suffix migration until SPX supports configured node kinds and methodology context injection, and uses active migration rows for executable work. Preserve the local distinction between volatile node-lifecycle state and durable persistence concerns when this node is projected into the target capability structure. Where this note predates the root plan, the root plan governs.

This coordination note records state-model work opened by the methodology and materialization restructure.

## Current role

`spx/23-spec-tree.enabler/76-node-state-derivation.enabler` derives `declared`, `specified`, `failing`, and `passing` from source evidence records and optional evidence providers.

## Required expansion

The state model needs to align with the configured Outcome Engineering methodology vocabulary consumed by SPX and with `spx/23-spec-tree.enabler`.

States to evaluate:

- `declared`: spec exists, no verification evidence
- `specified`: verification exists, implementation intentionally absent or excluded
- `prototype`: implementation exists before test evidence and is gated by feature or deployment state
- `failing`: implementation/evidence violates assertions
- `passing`: implementation/evidence satisfies assertions
- deployed or flag-related variants if product methodology requires user-visible rollout state

## Boundary rules

- State semantics live in the logical foundation.
- Backend metadata and evidence records provide inputs to state derivation.
- Interfaces render states but do not define them.

## Next action

Record missing state vocabulary in the external methodology work and root coordination first, then rewrite this node's spec and ADRs to use that vocabulary and to consume backend/evidence inputs rather than spec-domain status files.
