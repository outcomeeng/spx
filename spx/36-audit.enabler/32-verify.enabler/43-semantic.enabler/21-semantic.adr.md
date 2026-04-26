# Semantic Validation Module

## Purpose

This decision governs the TypeScript module for semantic validation of a structurally valid `AuditVerdict` — checking internal coherence between gate statuses, finding presence, and the overall verdict.

## Context

**Business impact:** The semantic stage is the third stage in the four-stage verify pipeline. It assumes structural validity: all required elements are present and enum values are valid. Downstream stages (paths) depend on semantic validity. A semantic defect stops the pipeline before the paths stage operates on a logically contradictory verdict.

**Technical constraints:** The semantic stage receives a fully parsed `AuditVerdict` from the reader, validated by the structural stage. It must not re-read the file, re-parse XML, or check element presence — those are structural concerns. All validation is purely over the in-memory representation. The stage produces a list of defect strings; it does not throw.

## Decision

The semantic validation module exports a single `validateSemantics(verdict: AuditVerdict): readonly string[]` function. An empty array means no defects. Each element of the returned array is a defect message string suitable for display as `semantic: {message}` in the verify pipeline output.

Coherence checks run in a fixed order:

1. Overall verdict coherence: `APPROVED` requires all gates `PASS`; `REJECT` requires at least one gate `FAIL`
2. For each gate with status `FAIL`: at least one finding must be present
3. For each gate with status `SKIPPED`: a `skipped_reason` field must be present

The function is pure: same input always produces the same output, no side effects, no I/O.

## Rationale

Returning `readonly string[]` rather than throwing on the first defect allows all semantic defects to surface in one pass. The check order follows logical dependency: verdict coherence is the top-level constraint; per-gate checks follow.

The verdict coherence rule captures a class of authoring errors where a reviewer approves the overall verdict but leaves a failing gate, or vice versa. The structural stage cannot catch this because coherence is a semantic property — it requires comparing multiple fields simultaneously.

`SKIPPED` gates require a reason because a verdict with unexplained skips is not actionable for reviewers. This is a semantic constraint, not a structural one: the presence check for `skipped_reason` happens here, not in the structural stage, because it only applies conditionally (when `status === "SKIPPED"`).

## Trade-offs accepted

| Trade-off                               | Mitigation / reasoning                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| Exhaustive checks in a fixed order      | Predictable, testable output order; tests can assert exact message content             |
| SKIPPED gating depends on status string | Structural stage validates the status enum before semantic stage runs; safe to compare |

## Invariants

- `validateSemantics` is a pure function: same input always produces the same output
- An empty `readonly string[]` return means no semantic defects
- Each defect string is a self-contained message describing the specific defect

## Compliance

### Recognized by

A single pure function receives an `AuditVerdict` and returns an array of defect strings. No XML parsing, no file I/O, no element-presence checks occur inside the semantic validation module.

### MUST

- Return `readonly string[]` — empty array for no defects, populated for defects ([review])
- Check overall verdict coherence against gate statuses ([review])
- Check that each `FAIL` gate has at least one finding ([review])
- Check that each `SKIPPED` gate has a `skipped_reason` ([review])
- Include the gate name or index in per-gate defect messages when the name is available ([review])

### NEVER

- Throw exceptions — defects are reported as strings in the return value ([review])
- Re-read the verdict file or re-parse XML — the `AuditVerdict` is already in memory ([review])
- Check element presence or enum membership — those are structural concerns ([review])
- Check path existence — that is a paths-stage concern ([review])
