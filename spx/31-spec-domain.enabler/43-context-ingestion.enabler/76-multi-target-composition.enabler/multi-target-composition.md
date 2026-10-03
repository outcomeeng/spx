---
malleability: spec
---

# Multi-Target Composition

PROVIDES canonical composition across product, methodology, and one or more target projections
SO THAT agents requesting context for several targets
CAN receive every required entry once at the highest mode any target selects, and reload complete context after compaction without a persisted receipt

## Assertions

- Given one or more requested targets, when SPX composes their context, then it resolves every requested target, computes each complete projection and transitive citation closure, merges entries by canonical identity, and applies Full-over-Digest precedence
- Target order never changes the output.
- Every document and reference several targets share appears once.
- ALWAYS: any requested target failure or any selected document failure aborts the whole projection before output

### Compliance

- ALWAYS: after compaction the caller requests every target the continuing work requires ([audit])
