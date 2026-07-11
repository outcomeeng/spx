# Test Command Generators

PROVIDES coherent generated spec-tree paths, test files, source changes, product inputs, command selections, runner outcomes, and recorded-state scenarios composed from production-owned testing contracts and registered language descriptors
SO THAT the shared testing harness and testing behavior evidence
CAN explore dispatch, changed-set planning, execution recording, and output behavior without reconstructing product vocabulary or coupling independent arbitrary draws

## Assertions

### Properties

- Every generated distinct-node pair contains non-equal node paths where neither path is an ancestor of the other ([test](tests/test-generators.property.l1.test.ts))
- Every generated parent-and-descendant pair contains non-equal node paths where the descendant is below the parent ([test](tests/test-generators.property.l1.test.ts))
- Every generated test and support path is co-located under the generated node, and the selected registered language descriptor classifies only the test path as test evidence ([test](tests/test-generators.property.l1.test.ts))

### Compliance

- ALWAYS: variable testing domains, property runs, shrinking, sampling, and replay data are owned by this generator rather than by executed test files or testing harnesses ([audit])
- ALWAYS: command names, option names, config fields, state fields, spec-tree grammar, runner vocabulary, and language matching come from their production owners; the generator composes those contracts without redeclaring them ([audit])
- NEVER: generic literal generation substitutes for a domain relationship; values that must agree are emitted together as one coherent testing scenario ([audit])
