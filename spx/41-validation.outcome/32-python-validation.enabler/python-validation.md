# Python Validation

PROVIDES the Python validation pipeline — ruff for lint, mypy and pyright for type checking, semgrep for AST enforcement
SO THAT `spx validation all` running against a Python project
CAN report quality issues across every Python-specific concern before code reaches production

## Assertions

### Scenarios

- Given a Python project with no violations, when `spx validation all` runs, then every Python stage passes and the command exits zero ([test](tests/python-validation.integration.test.ts))
- Given a project where language detection reports Python absent, when `spx validation all` runs, then no Python stage executes ([test](tests/python-validation.integration.test.ts))

### Mappings

- Python stages: `lint` → ruff, `type-check` → mypy and pyright, `ast-enforcement` → semgrep ([test](tests/python-validation.integration.test.ts))

### Compliance

- ALWAYS: every Python stage is gated on `detectPython` reporting present ([test](tests/python-validation.integration.test.ts))
- NEVER: invoke a Python stage's tool against a project where language detection reports Python absent ([test](tests/python-validation.integration.test.ts))
