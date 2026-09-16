# Context Target Resolution

Spec-context target resolution separates filesystem canonicalization from pure identity selection over a parsed spec-tree snapshot. An injected path boundary normalizes candidate paths, resolves symbolic links, and supplies containment facts; pure selection combines candidates from the effective invocation directory, product root, and complete-path-component suffix matches over accepted snapshot targets. Resolution returns a typed canonical target identity or structured failure; the CLI interface owns diagnostic rendering.

## Rationale

Snapshot membership defines accepted targets, while filesystem facts establish which accepted identity a supplied path denotes. Separating these responsibilities admits symbolic-link aliases without admitting untracked artifacts or outside-product targets. Combining candidate sources without precedence exposes ambiguity instead of hiding it behind an exact or invocation-relative match. Typed failures keep target selection free of terminal wording and let every interface present the same resolution facts.

## Invariants

- Candidate enumeration order does not change the resolution result.
- Multiple accepted artifact paths denoting the same node collapse to one identity.
- Every successful resolution names exactly one snapshot target inside the resolved product root.

## Verification

- ALWAYS: filesystem canonicalization enters through an injected path boundary, while identity selection is pure over the snapshot and supplied path facts.
- ALWAYS: the resolution result distinguishes unresolved, ambiguous, unsupported-artifact, and outside-product failures and carries the input and canonical matches needed for diagnostic rendering.
- NEVER: pure identity selection accesses the filesystem, process, environment, or terminal.
- NEVER: candidate sources receive precedence, abbreviated path components substitute for complete-component suffix matching, or an ambiguous result selects its first candidate.

### Audit

- NEVER: tests replace target-resolution dependencies through `vi.mock()` or `jest.mock()` ([audit])
