# Node State Derivation

PROVIDES node state derivation from source evidence records and optional evidence providers
SO THAT snapshots expose declared, specified, failing, and passing states through the public spec-tree surface
CAN drive traversal, projections, validation scopes, and command output without storing status by hand

## Assertions

### Mappings

- Spec and evidence combinations map to node states through the public snapshot: missing evidence maps to `declared`, linked evidence without implementation maps to `specified`, failing evidence maps to `failing`, and passing evidence maps to `passing` ([test](tests/node-state-derivation.mapping.l1.test.ts))

### Compliance

- ALWAYS: an injected evidence provider may override derived state for a node when backend-specific evidence owns the state decision ([test](tests/node-state-derivation.mapping.l1.test.ts))
