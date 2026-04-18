# Python Lint

PROVIDES ruff-based lint checking for Python source code
SO THAT `spx validation lint` and `spx validation all`
CAN run ruff against Python projects — executing style, correctness, security, and refactoring rule sets — while leaving non-Python projects untouched

## Assertions

### Scenarios

- Given a project with Python present and a `pyproject.toml` containing a `[tool.ruff]` section, when `spx validation lint` runs, then ruff executes and exits zero for a clean project ([test](tests/lint.integration.test.ts))
- Given a project where language detection reports Python absent, when `spx validation lint` runs, then ruff does not execute ([test](tests/lint.integration.test.ts))
- Given a Python project with lint violations, when `spx validation lint` runs, then the command exits non-zero and reports the violations ([test](tests/lint.integration.test.ts))

### Compliance

- ALWAYS: ruff invocation is gated on `detectPython` reporting present ([test](tests/lint.integration.test.ts))
- ALWAYS: ruff runs via `uv run ruff check` so the project's managed Python environment provides the tool ([review])
- NEVER: invoke ruff against a project lacking a `pyproject.toml` ([test](tests/lint.integration.test.ts))
