# Language Detection

PROVIDES project language identification based on configuration file presence
SO THAT validation steps (ast-enforcement, type checking, linting)
CAN run only the tools applicable to the languages the project actually uses

## Assertions

### Scenarios

- Given a project with `tsconfig.json`, when language detection runs, then TypeScript is identified as present ([test](tests/language-detection.unit.test.ts))
- Given a project with `pyproject.toml`, when language detection runs, then Python is identified as present ([test](tests/language-detection.unit.test.ts))
- Given a project with both `tsconfig.json` and `pyproject.toml`, when language detection runs, then both languages are identified ([test](tests/language-detection.unit.test.ts))
- Given a project with neither marker file, when language detection runs, then no languages are identified ([test](tests/language-detection.unit.test.ts))

### Properties

- Detection is deterministic: the same project root always produces the same language set ([test](tests/language-detection.unit.test.ts))

### Compliance

- NEVER: scan directory trees for file extensions — detection uses marker files only, per ADR 21-detection-approach ([review])
