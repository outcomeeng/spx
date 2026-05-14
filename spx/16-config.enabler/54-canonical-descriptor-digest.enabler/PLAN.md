# Plan: Canonical Descriptor Digest

## Purpose

Implement canonical descriptor JSON and SHA-256 digests for resolved descriptor sections.

## Governing Specs

- `spx/16-config.enabler/21-descriptor-registration.adr.md`
- `spx/41-testing.enabler/43-last-run-evidence.enabler/last-run-evidence.md`
- `spx/36-audit.enabler/54-branch-run-state.enabler/branch-run-state.md`
- `spx/46-reviewing.enabler/43-review-state.enabler/review-state.md`

## Implementation Notes

- Implement canonical JSON in config-owned code, not in individual domain modules.
- Reject non-JSON-representable descriptor values before digest computation.
- Preserve array order exactly; sort object keys recursively by Unicode code point.
- Use `node:crypto` SHA-256 and lowercase hex output.

## Evidence Required

- Tests cover recursive object sorting, array preservation, primitive serialization, null handling, and stable bytes for equivalent resolved sections.
- Tests reject `undefined`, `NaN`, `Infinity`, functions, symbols, and other non-representable values.
- Digest tests prove unrelated descriptor sections and raw file formatting do not affect the digest.

## Parallelization

This node can proceed in parallel with descriptor registration if both branches agree on the exported digest API before integrating.
