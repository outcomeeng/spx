# Target Resolution

PROVIDES canonical resolution of context operands to accepted Product Tree target identities
SO THAT context selection and loaded-context reconstruction
CAN accept convenient unambiguous paths while rejecting unknown, ambiguous, unsupported, and outside-product inputs without guessing

## Assertions

- Context targets accept the product root or product spec, a node directory or its spec, and an ADR or PDR; every other artifact class is rejected.
- A node directory and its spec identify the same node; a decision identifies its directly containing node or product root and selects that container's projection.
- Absolute operands resolve as written, while relative operands collect candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over accepted target paths only.
- Candidate sources have no precedence; candidates are normalized, resolved through symbolic links, confined to the resolved product root, and collapsed by target identity before zero, one, or several identities produce unresolved, success, or ambiguous results.
- Ambiguity reports every canonical accepted-target match and never selects the first match or uses a descendant to disambiguate an ambiguous ancestor.
