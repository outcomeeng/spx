# Subsumption Merging

WE BELIEVE THAT merging permission records using subsumption rules that resolve conflicts deterministically
WILL produce a single consistent permission set from any number of input files
CONTRIBUTING TO eliminating permission drift by making the merge result predictable and auditable

## Assertions

### Scenarios

- Given a permission in both allow and deny, when conflicts are resolved, then it is removed from allow and kept in deny ([test](tests/merger.unit.test.ts))
- Given a broader deny (e.g. `Bash(git:*)`) and narrower allow (e.g. `Bash(git log:*)`), when conflicts are resolved, then the narrower allow is subsumed ([test](tests/merger.unit.test.ts))
- Given a narrower deny and broader allow, when conflicts are resolved, then both are kept — narrower deny does not subsume broader allow ([test](tests/merger.unit.test.ts))
- Given two permission sets with no overlapping types, when merged, then both lists are unchanged ([test](tests/merger.unit.test.ts))
- Given identical permissions across multiple files, when merged, then duplicates are removed ([test](tests/merger.unit.test.ts))

### Properties

- Merging is deterministic: the same inputs always produce the same output ([test](tests/merger.property.test.ts))
- Merging is commutative: order of input files does not affect the result ([test](tests/merger.property.test.ts))
- Subsumption is transitive: if A subsumes B and B subsumes C, then A subsumes C ([test](tests/subsumption.property.test.ts))

### Compliance

- ALWAYS: merged output is sorted alphabetically within each category ([test](tests/merger.unit.test.ts))
- ALWAYS: ask permissions are unaffected by allow/deny conflict resolution ([test](tests/merger.unit.test.ts))
