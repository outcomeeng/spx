# Validation Test Generators

PROVIDES coherent generated validation configurations, tool descriptors, product layouts, path scopes, pipeline outcomes, and command scenarios composed from production-owned validation contracts
SO THAT the validation test harness and validation behavior evidence
CAN explore configuration, discovery, scope resolution, pipeline, and tool behavior without assertion files or harnesses reconstructing protocol vocabulary or related values

## Assertions

### Properties

- Every generated unknown validation subcommand remains outside the source-owned command vocabulary and reaches the production unknown-subcommand diagnostic path ([test](tests/validation-test-generators.property.l2.test.ts))

### Compliance

- ALWAYS: variable validation domains, property runs, shrinking, sampling, and replay data are owned by this generator rather than by executed test files or validation harnesses ([audit])
- ALWAYS: command vocabulary, configuration fields, tool identifiers, path grammar, stage names, result fields, and diagnostic identifiers come from their production owners; the generator composes those contracts without redeclaring them ([audit])
- NEVER: generic literal generation substitutes for a validation-domain relationship; values that must agree are emitted together as one coherent validation scenario ([audit])
