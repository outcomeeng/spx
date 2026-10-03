# Context Target Resolution

Spec-context target resolution separates filesystem canonicalization from pure identity selection over a parsed spec-tree snapshot. An injected path boundary normalizes candidate paths, resolves symbolic links, and supplies containment facts; pure selection combines candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over accepted snapshot targets. Resolution returns a typed canonical target identity or a structured unresolved or ambiguous failure; the CLI interface renders that result for the invocation host. Confinement discards every candidate whose resolved location lies outside the resolved product root, through lexical traversal or symbolic-link resolution, before identities collapse, and an absolute operand yields one candidate. An operand left with zero identities fails as unresolved, including an operand whose every candidate escapes and an operand naming an existing artifact of a class context targets do not accept; an operand left with one identity resolves to it even when another of its candidates escaped; and an operand left with several identities fails as ambiguous.

## Rationale

Snapshot membership defines accepted targets, while filesystem facts establish which accepted identity a supplied path denotes. Separating those responsibilities admits symbolic-link aliases without admitting untracked artifacts or outside-product targets. Combining candidate sources without precedence exposes ambiguity instead of hiding it behind an exact or invocation-relative match. Complete-component suffix matching accepts convenient unambiguous paths without introducing abbreviated component-prefix semantics. Typed failures keep target selection free of terminal wording and let every interface present the same resolution facts appropriately. The typed failures are exactly the unresolved and ambiguous kinds of [spx/29-verification-path-scope.pdr.md](spx/29-verification-path-scope.pdr.md), which discards every candidate outside the resolved product root before identities collapse and fails zero identities as unresolved. An operand whose every candidate escapes therefore reaches zero identities and fails as unresolved, an escaping candidate beside a candidate inside the root is discarded and leaves the result to the candidates that remain, and an existing artifact of an unaccepted class denotes no accepted target and fails as unresolved. No outside-product or unsupported-artifact failure kind exists, so every operand reaches exactly one outcome class.

## Invariants

- Candidate enumeration order does not change the resolution result.
- Multiple accepted artifact paths denoting the same node collapse to one identity.
- Every successful resolution names exactly one snapshot target inside the resolved product root.

## Verification

### Testing

- ALWAYS: every candidate whose resolved location lies outside the resolved product root, through lexical traversal or symbolic-link resolution, is discarded before identities collapse, and an absolute operand yields one candidate; an operand with zero identities fails as unresolved, including an operand whose every candidate escapes and an operand naming an existing artifact of a class context targets do not accept, an operand with one identity resolves to it even when another of its candidates escaped, and an operand with several identities fails as ambiguous ([mapping])
- ALWAYS: each unresolved and ambiguous target-resolution failure maps to a CLI diagnostic naming its failure kind and the rejected operand, and an ambiguous failure's diagnostic additionally names every canonical match ([mapping])
- NEVER: target resolution gives a candidate source precedence ([compliance])
- NEVER: target resolution substitutes abbreviated path-component prefixes for complete-component suffix matching ([compliance])
- NEVER: target resolution selects the first identity from an ambiguous result ([compliance])

### Audit

- ALWAYS: filesystem canonicalization enters through an injected path boundary ([audit])
- ALWAYS: identity selection operates only on the parsed spec-tree snapshot and supplied path facts and returns a typed result without filesystem, process, environment, or terminal access ([audit])
- NEVER: tests replace target-resolution dependencies through `vi.mock()` or `jest.mock()` ([audit])
