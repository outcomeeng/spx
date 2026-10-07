# Status Derivation

An output node's state derives from its declarations, required verification artifacts, and attributed results against its declared malleability. The projector alone writes that derived state and its supporting result pins to the node's committed `spx.status.json` claim.

## Rationale

Machine-written claims retain inspectable verification results without making a manually assigned label authoritative. Pins bind each result to its declaration, verification artifact, and subject; a changed pinned path invalidates the result. Tests, evals, audits, and probes supply the results their assertion tags require. Rejected alternatives are manually maintained status labels, which drift from evidence, and test-only derivation, which omits other required verification types.

## Invariants

- Identical declarations, artifacts, attributed results, and pins produce identical state.
- Only current results satisfy a node's verification requirements.
- The projector is the sole writer of `spx.status.json`.

## Verification

### Testing

- ALWAYS: derive the same state from identical declarations, artifacts, attributed results, and pins ([property])
- ALWAYS: invalidate an attributed result when a path named by its pin changes ([property])
- NEVER: let an invalidated result satisfy a required verification result ([compliance])

### Audit

- ALWAYS: the projector alone writes the committed `spx.status.json` claim ([audit])
- NEVER: a manually assigned label overrides evidence-derived state ([audit])
