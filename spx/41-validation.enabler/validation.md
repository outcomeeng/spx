# Validation

PROVIDES a multi-language code quality pipeline that reports each tool's result as it completes
SO THAT developers and agents running `spx validation all`
CAN surface security, maintainability, and reliability issues before they reach production

## Assertions

### Scenarios

- Given a project with no violations, when `spx validation all` runs, then all steps pass and exit 0 ([test](tests/validation.integration.test.ts))
- Given a project with a failing step, when `spx validation all` runs, then the pipeline reports the failure with step name and details ([test](tests/validation.integration.test.ts))
- Given `--scope production`, when `spx validation all` runs, then only production-scoped checks execute ([test](tests/validation.integration.test.ts))
- Given `--files path/to/file.ts`, when `spx validation all` runs, then checks target only the specified files ([test](tests/validation.integration.test.ts))
- Given a step completes, when subsequent steps are still running, then the completed step's result is already visible in output ([test](tests/validation.integration.test.ts))

### Mappings

- TypeScript has lint, type check, AST enforcement, circular dependency detection, and literal reuse stages ([test](tests/validation.unit.test.ts))
- Python has lint, type check, and AST enforcement stages ([test](tests/validation.unit.test.ts))

### Properties

- Validation results are deterministic: the same codebase always produces the same pass/fail verdict ([test](tests/validation.integration.test.ts))
- Validation is additive: adding a new step never changes the verdict of existing steps ([test](tests/validation.integration.test.ts))

### Compliance

- ALWAYS: validation runs all configured steps regardless of earlier failures — no short-circuit ([test](tests/validation.integration.test.ts))
- ALWAYS: validation exit code is non-zero when any step fails ([test](tests/validation.integration.test.ts))
- ALWAYS: each step reports its own duration ([test](tests/validation.integration.test.ts))
