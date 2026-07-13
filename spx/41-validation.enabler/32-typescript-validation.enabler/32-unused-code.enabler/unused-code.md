PROVIDES Knip-based unused-code validation for TypeScript projects
SO THAT `spx validation knip` and `spx validation all`
CAN report unused exports, dependencies, and files within the requested TypeScript validation scope

## Assertions

### Scenarios

- Given TypeScript is absent, when Knip validation runs, then the command exits zero with the TypeScript-absent skip result and neither tool discovery nor Knip execution runs ([test](tests/unused-code.scenario.l1.test.ts))
- Given `validation.knip.enabled` is false, when Knip validation runs, then the command exits zero with the configured-disabled skip result and neither tool discovery nor Knip execution runs ([test](tests/unused-code.scenario.l1.test.ts))
- Given Knip is unavailable, when Knip validation runs, then the command exits zero with the tool-unavailable skip result and Knip execution does not run ([test](tests/unused-code.scenario.l1.test.ts))
- Given Knip reports no unused code, when Knip validation runs, then the command exits zero with the Knip success result ([test](tests/unused-code.scenario.l1.test.ts))
- Given Knip reports unused code, when Knip validation runs, then the command exits non-zero with Knip's failure detail ([test](tests/unused-code.scenario.l1.test.ts))
- Given an explicit TypeScript file operand, when Knip validation runs, then Knip receives only that resolved file scope ([test](tests/unused-code.scenario.l1.test.ts))

### Properties

- For every executable path returned by Knip discovery, unused-code validation spawns that exact executable ([test](tests/unused-code.property.l1.test.ts))

### Compliance

- ALWAYS: when Knip validation streams subprocess detail during a full-pipeline run, its returned result carries the detail and exactly one terminal verdict ([test](tests/unused-code.compliance.l1.test.ts))
