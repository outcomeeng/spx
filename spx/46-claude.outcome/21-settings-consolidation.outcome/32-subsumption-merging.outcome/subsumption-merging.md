# Subsumption Merging

WE BELIEVE THAT merging permission records using subsumption rules that resolve conflicts deterministically
WILL produce a single consistent permission set from any number of input files
CONTRIBUTING TO eliminating permission drift by making the merge result predictable and auditable

## Assertions

### Properties

- Merging is deterministic: the same inputs always produce the same output ([test](tests/merger.unit.test.ts))
- Merging is commutative: order of input files does not affect the result ([test](tests/merger.property.test.ts))
- Subsumption is transitive: if A subsumes B and B subsumes C, then A subsumes C ([test](tests/subsumption.property.test.ts))

### Scenarios

- Given two permission sets with no conflicts, when merged, then the result is the union ([test](tests/merger.unit.test.ts))
- Given conflicting allow and deny for the same scope, when merged, then deny takes precedence ([test](tests/subsumption.unit.test.ts))
