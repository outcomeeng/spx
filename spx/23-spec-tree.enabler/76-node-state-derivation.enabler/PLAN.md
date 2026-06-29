# Plan: State model expansion

This coordination note records state-model work opened by the methodology and materialization restructure.

## Current role

`spx/23-spec-tree.enabler/76-node-state-derivation.enabler` derives `declared`, `specified`, `failing`, and `passing` from source evidence records and optional evidence providers.

## Required expansion

The state model needs to become a product-level state vocabulary governed by `spx/12-spec-tree-methodology.pdr.md` and materialized by `spx/23-spec-tree.enabler`.

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

After the methodology PDR exists, rewrite this node's spec and ADRs to use that vocabulary and to consume materialization inputs rather than spec-domain status files.
