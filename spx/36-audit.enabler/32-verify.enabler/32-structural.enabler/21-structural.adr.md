# Structural Validation Module

## Purpose

This decision governs the TypeScript module for structural validation of a parsed `AuditVerdict` — checking required element presence, gate status enumeration, overall verdict enumeration, and findings count consistency.

## Context

**Business impact:** The structural stage is the second stage in the four-stage verify pipeline. Downstream stages (semantic, paths) depend on structural validity: the semantic stage assumes gates have valid status values; the paths stage assumes findings are well-formed. A structural defect stops the pipeline before later stages operate on malformed data.

**Technical constraints:** The structural stage receives a fully parsed `AuditVerdict` from the reader. It must not re-read the file or re-parse XML. All validation is purely over the in-memory representation. The stage produces a list of defect strings; it does not throw. A stage that throws would short-circuit the pipeline without producing actionable output.

## Decision

The structural validation module exports a single `validateStructure(verdict: AuditVerdict): readonly string[]` function. An empty array means no defects. Each element of the returned array is a defect message string suitable for display as `structural: {message}` in the verify pipeline output.

Six structural checks run in a fixed order and are exhaustive across the verdict:

1. `<header>` presence
2. `<spec_node>` inside `<header>` presence
3. `<verdict>` inside `<header>` presence
4. `<timestamp>` inside `<header>` presence
5. `<gates>` presence (at least one gate)
6. `<verdict>` value membership in `{APPROVED, REJECT}`

For each `<gate>`, two additional checks run:

7. `<status>` value membership in `{PASS, FAIL, SKIPPED}`
8. `count` attribute value matches the number of `<finding>` elements

The enumeration constants `VALID_VERDICTS` and `VALID_GATE_STATUSES` are module-internal constants — not exported as part of the public API.

The function is pure: same input always produces the same output, no side effects, no I/O.

## Rationale

Returning `readonly string[]` rather than throwing on the first defect allows the stage to surface all structural defects in one pass. A caller that receives an array can display all defects at once, which is more actionable than re-running the verify command for each defect individually.

The check order follows the document structure top-down: header fields are checked before gate fields, which are checked before per-gate fields. This matches the XML document order and makes the output predictable for test assertions.

`validateStructure` is pure (no I/O, no external state) because it only operates on the `AuditVerdict` type already in memory. This enables exhaustive l1 testing without any file-system or process infrastructure.

Checking `count` attribute against actual `<finding>` element count catches a class of authoring errors where the author updates findings but forgets to update the count attribute. The structural stage is the right place for this because it has access to both the attribute and the element list simultaneously.

## Trade-offs accepted

| Trade-off                                 | Mitigation / reasoning                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Exhaustive checks in a fixed order        | Predictable, testable output order; tests can assert exact message positions                                             |
| `count` compared as integers, not strings | `count` attribute is a string from the reader; `parseInt` is needed; NaN means invalid, which is a count-mismatch defect |

## Invariants

- `validateStructure` is a pure function: same input always produces the same output
- An empty `readonly string[]` return means no structural defects
- Each defect string is a self-contained message describing the specific defect

## Compliance

### Recognized by

A single pure function receives an `AuditVerdict` and returns an array of defect strings. No XML parsing, no file I/O occurs inside the structural validation module.

### MUST

- Return `readonly string[]` — empty array for no defects, populated for defects ([review])
- Check all six required-element presence rules and both per-gate rules ([review])
- Include the gate name or index in per-gate defect messages when the name is available ([review])
- Include the bad value in enum-violation defect messages ([review])

### NEVER

- Throw exceptions — defects are reported as strings in the return value ([review])
- Re-read the verdict file or re-parse XML — the `AuditVerdict` is already in memory ([review])
- Interpret semantic meaning of gate statuses or overall verdict — only validate presence and enum membership ([review])
- Import test infrastructure or file-reading logic into the structural validation module — the function operates only on the in-memory `AuditVerdict` type ([review])
