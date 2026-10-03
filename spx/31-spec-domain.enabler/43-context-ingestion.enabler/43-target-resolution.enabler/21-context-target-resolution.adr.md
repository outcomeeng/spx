# Context Target Resolution

Spec-context target resolution separates filesystem canonicalization from pure identity selection over a parsed spec-tree snapshot. An injected path boundary normalizes candidate paths, resolves symbolic links, and supplies containment facts; pure selection combines candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over accepted snapshot targets. Resolution returns a typed canonical target identity or a structured outside-product, unresolved, or ambiguous failure; the CLI interface renders that result for the invocation host. Confinement discards each candidate whose location escapes the resolved product root through lexical traversal or symbolic-link resolution, and a discarded candidate never decides the result. An operand fails as outside-product when every candidate it yields escaped, decided before identity resolution; otherwise an operand left with zero identities after confinement and collapse fails as unresolved, including an operand naming an existing artifact of a class context targets do not accept, an operand left with one identity resolves to it, and an operand left with several identities fails as ambiguous.

## Rationale

Snapshot membership defines accepted targets, while filesystem facts establish which accepted identity a supplied path denotes. Separating those responsibilities admits symbolic-link aliases without admitting untracked artifacts or outside-product targets. Combining candidate sources without precedence exposes ambiguity instead of hiding it behind an exact or invocation-relative match. Complete-component suffix matching accepts convenient unambiguous paths without introducing abbreviated component-prefix semantics. Typed failures keep target selection free of terminal wording and let every interface present the same resolution facts appropriately. The typed failures are exactly the outside-product, unresolved, and ambiguous kinds [spx/29-verification-path-scope.pdr.md](spx/29-verification-path-scope.pdr.md) declares. The order that separates outside-product from unresolved is this decision's own, consistent with that PDR's discarding of candidates outside the product root: an operand whose every candidate escapes the product root names only locations outside the product, so it fails as outside-product before any identity is sought, an escaping candidate beside a candidate inside the root is discarded and leaves the result to the candidates that remain, and an existing artifact of an unaccepted class denotes no accepted target and therefore fails as unresolved.

## Invariants

- Candidate enumeration order does not change the resolution result.
- Multiple accepted artifact paths denoting the same node collapse to one identity.
- Every successful resolution names exactly one snapshot target inside the resolved product root.

## Verification

### Testing

- ALWAYS: an operand every candidate of which escapes the resolved product root through lexical traversal or symbolic-link resolution fails as outside-product before identity resolution; otherwise a discarded escaping candidate never decides the result, an operand with zero identities after confinement and collapse fails as unresolved, including an operand naming an existing artifact of a class context targets do not accept, an operand with one identity resolves to it, and an operand with several identities fails as ambiguous ([mapping])
- ALWAYS: each outside-product, unresolved, and ambiguous target-resolution failure maps to a CLI diagnostic naming its failure kind and the rejected operand, and an ambiguous failure's diagnostic additionally names every canonical match ([mapping])
- NEVER: target resolution gives a candidate source precedence ([compliance])
- NEVER: target resolution substitutes abbreviated path-component prefixes for complete-component suffix matching ([compliance])
- NEVER: target resolution selects the first identity from an ambiguous result ([compliance])

### Audit

- ALWAYS: filesystem canonicalization enters through an injected path boundary ([audit])
- ALWAYS: identity selection operates only on the parsed spec-tree snapshot and supplied path facts and returns a typed result without filesystem, process, environment, or terminal access ([audit])
- NEVER: tests replace target-resolution dependencies through `vi.mock()` or `jest.mock()` ([audit])
