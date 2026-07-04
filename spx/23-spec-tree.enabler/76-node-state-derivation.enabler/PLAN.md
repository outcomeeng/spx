# Plan: State model expansion

> **Reconcile against `spx/PLAN.md` first.** "state" here is the *volatile node-lifecycle* state (declared / specified / passing), deliberately distinct from durable `persistence` (records / journals / snapshots) — a node-state flips in a moment, a GitHub artifact lives 90 days. "materialization" is renamed `backend`. Where this note predates that model, the root plan governs.

This coordination note records state-model work opened by the methodology and materialization restructure.

## Current role

`spx/23-spec-tree.enabler/76-node-state-derivation.enabler` derives `declared`, `specified`, `failing`, and `passing` from source evidence records and optional evidence providers.

## Required expansion

The state model needs to become a product-level state vocabulary governed by `spx/09-methodology-vocabulary.pdr.md` and materialized by `spx/23-spec-tree.enabler`.

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

Amend `spx/09-methodology-vocabulary.pdr.md` where the state vocabulary needs a term it lacks — it already exists and owns the methodology vocabulary, so do not author a second methodology PDR — then rewrite this node's spec and ADRs to use that vocabulary and to consume materialization inputs rather than spec-domain status files.
