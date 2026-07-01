# Language Detection

PROVIDES product language identification based on configuration file presence
SO THAT quality-gate enablers (validation stages and test runners)
CAN run only the tools applicable to the languages the product actually uses

## Assertions

### Scenarios

- Given a product with `tsconfig.json`, when language detection runs, then TypeScript is identified as present ([test](tests/language-detection.scenario.l1.test.ts))
- Given a product with `pyproject.toml`, when language detection runs, then Python is identified as present ([test](tests/language-detection.scenario.l1.test.ts))
- Given a product with both `tsconfig.json` and `pyproject.toml`, when language detection runs, then both languages are identified ([test](tests/language-detection.scenario.l1.test.ts))
- Given a product with neither marker file, when language detection runs, then no languages are identified ([test](tests/language-detection.scenario.l1.test.ts))

### Properties

- Detection is deterministic: the same product root always produces the same language set ([test](tests/language-detection.property.l1.test.ts))

### Compliance

- NEVER: scan directory trees for file extensions — detection uses marker files only, per `spx/17-language-detection.enabler/21-detection-approach.adr.md` ([test](tests/language-detection.compliance.l1.test.ts))
