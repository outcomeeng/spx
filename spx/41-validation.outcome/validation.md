# Validation

WE BELIEVE THAT multi-language code quality measurement, reporting each result as it completes
WILL maximize security, maintainability, and reliability issues unearthed per second of developer wait time
CONTRIBUTING TO sustainable customer value delivery by catching these issues before they are deployed and replicated

## Assertions

### Scenarios

- Given a project with no violations, when `spx validation all` runs, then all steps pass and exit 0 ([test](tests/validation.integration.test.ts))
- Given a project with a failing step, when `spx validation all` runs, then the pipeline reports the failure with step name and details ([test](tests/validation.integration.test.ts))
- Given `--scope production`, when `spx validation all` runs, then only production-scoped checks execute ([test](tests/validation.integration.test.ts))
- Given `--files path/to/file.ts`, when `spx validation all` runs, then checks target only the specified files ([test](tests/validation.integration.test.ts))
- Given a step completes, when subsequent steps are still running, then the completed step's result is already visible in output ([test](tests/validation.integration.test.ts))

### Properties

- Validation results are deterministic: the same codebase always produces the same pass/fail verdict ([test](tests/validation.unit.test.ts))
- Validation is additive: adding a new step never changes the verdict of existing steps ([test](tests/validation.unit.test.ts))

### Mappings

- Every supported language — Python and TypeScript — has at least lint, type check, and circular dependency detection ([test](tests/validation.integration.test.ts))

### Compliance

- ALWAYS: validation runs all configured steps regardless of earlier failures — no short-circuit ([test](tests/validation.integration.test.ts))
- ALWAYS: validation exit code is non-zero when any step fails ([test](tests/validation.integration.test.ts))
- ALWAYS: each step reports its own duration ([test](tests/validation.integration.test.ts))
