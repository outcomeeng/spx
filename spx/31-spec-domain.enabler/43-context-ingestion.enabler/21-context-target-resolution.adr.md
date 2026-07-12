# Context Target Resolution

Spec-context target resolution is a pure operation over a parsed spec-tree snapshot. It normalizes an optional `spx/` root segment and trailing separators, resolves node-directory segments from parent to child, prefers an exact segment match, and accepts an abbreviated segment only when it uniquely prefixes one sibling node segment. Resolution returns a typed result carrying either the canonical node identity or a structured unknown-segment, ambiguous-segment, or artifact-input failure; the CLI interface renders that result for the invocation host.

## Rationale

Segment-by-segment resolution preserves the tree hierarchy and makes abbreviated input deterministic. Whole-string prefix matching could cross node boundaries or select a node because of an unrelated descendant, while filesystem probing would couple target identity to untracked paths rather than the parsed tree. Typed failures keep target selection free of terminal wording and let every interface present the same resolution facts appropriately.

## Invariants

- Resolving a canonical node identity returns that same canonical identity.
- Every successful abbreviated segment has exactly one matching sibling node segment at its resolved parent.
- An exact segment match wins even when the same text prefixes another sibling segment.

## Verification

### Audit

- ALWAYS: target resolution operates only on the parsed spec-tree snapshot and returns a typed result without filesystem access or process I/O ([audit])
- ALWAYS: the CLI interface translates structured resolution failures into user-facing diagnostics ([audit])
- NEVER: target resolution selects the first candidate for an ambiguous segment or uses whole-string fuzzy matching ([audit])
- NEVER: tests replace target-resolution dependencies through `vi.mock()` or `jest.mock()` ([audit])
