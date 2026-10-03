---
malleability: spec
---

# Target Resolution

PROVIDES canonical resolution of context operands to accepted Product Tree target identities
SO THAT context selection
CAN accept convenient unambiguous paths while rejecting unresolved and ambiguous inputs without guessing

## Assertions

- NEVER: a candidate source takes precedence over another
- ALWAYS: candidates are normalized, resolved through symbolic links, confined to the resolved product root, and collapsed by target identity before one identity produces success and several identities produce an ambiguous result
- ALWAYS: ambiguity reports every canonical accepted-target match
- NEVER: an ambiguous result selects its first match
- NEVER: a descendant disambiguates an ambiguous ancestor
- Context targets accept the product root or product spec, a node directory or its spec, and an ADR or PDR; every other artifact class is rejected.
- A node directory and its spec identify the same node.
- A decision identifies its directly containing node or product root and selects that container's projection.
- Absolute operands resolve as written, while relative operands collect candidates from the effective invocation directory, the product root, and complete-path-component suffix matches over accepted target paths only.
- An operand with zero identities after confinement and collapse maps to unresolved, including an operand whose every candidate escapes the resolved product root through lexical traversal or symbolic-link resolution and an operand naming an existing artifact of a class context targets do not accept; an operand with one identity resolves to it even when another of its candidates escaped; and an operand with several identities maps to ambiguous. From the product root the operand `../outside` maps to unresolved, and from `<root>/spx/a.enabler` the operand `../../PLAN.md` maps to unresolved while the operand `../../spx` succeeds.
