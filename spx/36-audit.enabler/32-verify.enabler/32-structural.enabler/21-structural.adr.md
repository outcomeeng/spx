# Structural Validation Module

Structural validation is a single pure function, `validateStructure(verdict)`, that returns a `readonly string[]` of defect messages — empty when the verdict is well-formed — each suitable for display as `structural: {message}`. It runs a fixed, exhaustive set of checks over the in-memory `AuditVerdict` and never performs I/O or throws.

## Rationale

Returning `readonly string[]` rather than throwing on the first defect lets the stage surface every structural defect in one pass, which is more actionable than re-running the command per defect. The checks run top-down — header fields, then `<gates>` presence, then per-gate fields — matching XML document order so the output position is predictable for test assertions. The function is pure because it operates only on the already-parsed `AuditVerdict`, which enables exhaustive `l1` testing without filesystem or process infrastructure. Comparing each gate's `count` attribute against the actual number of `<finding>` elements catches the authoring error of updating findings but forgetting the count, and the structural stage is the right place because it has both the attribute and the element list in hand.

## Invariants

- `validateStructure` is a pure function: the same input always produces the same output.
- An empty `readonly string[]` return means no structural defects.
- Each defect string is a self-contained message describing the specific defect.

## Verification

### Audit

- ALWAYS: return `readonly string[]` — empty for no defects, populated otherwise ([audit])
- ALWAYS: run the six required-element checks — `<header>`, and `<spec_node>`, `<verdict>`, `<timestamp>` within it, `<gates>` with at least one `<gate>`, and `<verdict>` value in `{APPROVED, REJECT}` — and the two per-gate checks — `<status>` value in `{PASS, FAIL, SKIPPED}` and `count` matching the number of `<finding>` elements ([audit])
- ALWAYS: parse each gate's `count` attribute as an integer; a non-numeric `count` (`NaN`) or a value unequal to the number of `<finding>` elements is a count-mismatch defect ([audit])
- ALWAYS: include the gate name or index in per-gate defect messages when the name is available ([audit])
- ALWAYS: include the offending value in enum-violation defect messages ([audit])
- NEVER: export `VALID_VERDICTS` or `VALID_GATE_STATUSES` — they are module-internal constants ([audit])
- NEVER: throw exceptions — defects are reported as strings in the return value ([audit])
- NEVER: re-read the verdict file or re-parse XML — the `AuditVerdict` is already in memory ([audit])
- NEVER: interpret the semantic meaning of gate statuses or the overall verdict — only validate presence and enum membership ([audit])
- NEVER: import test infrastructure or file-reading logic — the function operates only on the in-memory `AuditVerdict` ([audit])
