# Issues: 32-subsumption-merging.outcome

## FOLLOW-UP: the merge-determinism Property is proven by an example test

`subsumption-merging.md`'s Property assertion "Merging is deterministic: the same inputs always produce the same output" links to `tests/merger.scenario.l1.test.ts` — an example-based test. The sibling Property assertions (commutative, transitive) already have fast-check tests (`merger.property.l1.test.ts`, `subsumption.property.l1.test.ts`); determinism should too.

**Resolution:** add a determinism property to `tests/merger.property.l1.test.ts` (generate arbitrary input sets, assert repeated merges are equal) and repoint the determinism assertion's `[test]` link to it.

**Skills:** `typescript:testing-typescript` (property test), `spec-tree:applying`.
