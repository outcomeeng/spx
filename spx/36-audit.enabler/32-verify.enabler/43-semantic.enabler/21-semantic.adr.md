# Semantic Validation Module

Semantic validation is a single pure function, `validateSemantics(verdict)`, that returns a `readonly string[]` of defect messages — empty when the verdict is internally coherent — each suitable for display as `semantic: {message}`. It checks coherence over the structurally-valid in-memory `AuditVerdict` and never performs I/O or throws.

## Rationale

Returning `readonly string[]` rather than throwing lets all semantic defects surface in one pass, and the checks run in logical-dependency order: overall-verdict coherence is the top-level constraint, with per-gate checks following. The verdict-coherence rule catches the class of authoring error where a reviewer approves the overall verdict but leaves a failing gate, or rejects it with all gates passing — the structural stage cannot catch this because coherence is a semantic property that compares multiple fields at once. `SKIPPED` gates require a `skipped_reason` because a verdict with unexplained skips is not actionable for reviewers; that presence check belongs here rather than in the structural stage because it applies only conditionally, when a gate's status is `SKIPPED`.

## Invariants

- `validateSemantics` is a pure function: the same input always produces the same output.
- An empty `readonly string[]` return means no semantic defects.
- Each defect string is a self-contained message describing the specific defect.

## Verification

### Audit

- ALWAYS: return `readonly string[]` — empty for no defects, populated otherwise ([audit])
- ALWAYS: check overall-verdict coherence against gate statuses — `APPROVED` requires all gates `PASS`; `REJECT` requires at least one gate that is not `PASS` (a `FAIL` or `SKIPPED` gate) ([audit])
- ALWAYS: check that each `FAIL` gate has at least one finding ([audit])
- ALWAYS: check that each `SKIPPED` gate has a `skipped_reason` ([audit])
- ALWAYS: include the gate name or index in per-gate defect messages when the name is available ([audit])
- NEVER: throw exceptions — defects are reported as strings in the return value ([audit])
- NEVER: re-read the verdict file or re-parse XML — the `AuditVerdict` is already in memory ([audit])
- NEVER: check element presence or enum membership — those are structural concerns ([audit])
- NEVER: check path existence — that is a paths-stage concern ([audit])
