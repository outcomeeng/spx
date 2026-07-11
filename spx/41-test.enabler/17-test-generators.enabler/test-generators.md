# Test Command Generators

PROVIDES coherent generated spec-tree paths, test files, source changes, product inputs, command selections, runner outcomes, and recorded-state scenarios composed from production-owned testing contracts and registered language descriptors
SO THAT the shared testing harness and testing behavior evidence
CAN explore dispatch, changed-set planning, execution recording, and output behavior without reconstructing product vocabulary or coupling independent arbitrary draws

## Assertions

### Properties

- Every generated testing scenario preserves the relationships among node paths, test paths, support paths, source imports, product inputs, selected operands, runner outcomes, and recorded evidence required by the production contracts that consume it ([test](tests/test-generators.property.l1.test.ts))
- Generated distinct paths satisfy the independence or ancestry relation named by the scenario, and every generated test or support path is classified by the selected registered language descriptor as declared ([test](tests/test-generators.property.l1.test.ts))

### Compliance

- ALWAYS: variable testing domains, property runs, shrinking, sampling, and replay data are owned by this generator rather than by executed test files or testing harnesses ([audit])
- ALWAYS: command names, option names, config fields, state fields, spec-tree grammar, runner vocabulary, and language matching come from their production owners; the generator composes those contracts without redeclaring them ([audit])
- NEVER: generic literal generation substitutes for a domain relationship; values that must agree are emitted together as one coherent testing scenario ([audit])
