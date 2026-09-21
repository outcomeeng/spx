# Context Target Resolution

Spec-context target resolution separates filesystem canonicalization from pure identity selection over a parsed spec-tree snapshot. An injected path boundary normalizes candidate paths, resolves symbolic links, and supplies containment facts; pure selection combines candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over accepted snapshot targets. Resolution returns a typed canonical target identity or a structured unresolved, ambiguous, unsupported-artifact, or outside-product failure; the CLI interface renders that result for the invocation host.

## Rationale

Snapshot membership defines accepted targets, while filesystem facts establish which accepted identity a supplied path denotes. Separating those responsibilities admits symbolic-link aliases without admitting untracked artifacts or outside-product targets. Combining candidate sources without precedence exposes ambiguity instead of hiding it behind an exact or invocation-relative match. Complete-component suffix matching accepts convenient unambiguous paths without introducing abbreviated component-prefix semantics. Typed failures keep target selection free of terminal wording and let every interface present the same resolution facts appropriately.

## Invariants

- Candidate enumeration order does not change the resolution result.
- Multiple accepted artifact paths denoting the same node collapse to one identity.
- Every successful resolution names exactly one snapshot target inside the resolved product root.

## Verification

### Testing

- ALWAYS: each unresolved, ambiguous, unsupported-artifact, and outside-product target-resolution failure maps to an actionable CLI diagnostic that identifies the rejected input and carries every canonical match the failure requires ([mapping])
- NEVER: target resolution gives a candidate source precedence, substitutes abbreviated path-component prefixes for complete-component suffix matching, or selects the first identity from an ambiguous result ([compliance])

### Audit

- ALWAYS: filesystem canonicalization enters through an injected path boundary, while identity selection operates only on the parsed spec-tree snapshot and supplied path facts and returns a typed result without filesystem, process, environment, or terminal access ([audit])
- NEVER: tests replace target-resolution dependencies through `vi.mock()` or `jest.mock()` ([audit])
