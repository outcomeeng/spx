---
malleability: spec
---

# Target Resolution

PROVIDES canonical resolution of context operands to accepted Product Tree target identities
SO THAT context selection
CAN accept convenient unambiguous paths while rejecting unresolved, ambiguous, and outside-product inputs without guessing

## Assertions

### Mappings

- Context targets accept the product root or product spec, a node directory or its spec, and an ADR or PDR; every other artifact class is rejected. ([test](tests/context-target-resolution.mapping.l1.test.ts))
- A node directory and its spec identify the same node; a decision identifies its directly containing node or product root and selects that container's projection. ([test](tests/context-target-resolution.mapping.l1.test.ts))
- Absolute operands resolve as written, while relative operands collect candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over accepted target paths only. ([test](tests/context-target-resolution.mapping.l1.test.ts))
- An operand every candidate of which escapes the resolved product root through lexical traversal or symbolic-link resolution maps to outside-product, decided before identity resolution; a discarded escaping candidate never decides the result, so every other operand with zero identities after confinement and collapse maps to unresolved, including an operand naming an existing artifact of a class context targets do not accept, and from `<root>/spx/a.enabler` the operand `../../PLAN.md` maps to unresolved while the operand `../../spx` succeeds. ([test](tests/context-target-resolution.mapping.l1.test.ts))

### Compliance

- ALWAYS: candidate sources have no precedence; candidates are normalized, resolved through symbolic links, confined to the resolved product root, and collapsed by target identity before one identity produces success and several identities produce an ambiguous result ([test](tests/context-target-resolution.compliance.l1.test.ts))
- ALWAYS: ambiguity reports every canonical accepted-target match and never selects the first match or uses a descendant to disambiguate an ambiguous ancestor ([test](tests/context-target-resolution.compliance.l1.test.ts))
