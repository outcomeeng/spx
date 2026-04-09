# Python AST Enforcement

PROVIDES semgrep-based AST enforcement for Python source code
SO THAT Python-specific ADR compliance rules
CAN run as part of `spx validation all` — catching structural violations that ruff's built-in rule sets do not express — while leaving non-Python projects untouched

## Assertions

### Scenarios

- Given a project with Python present and a `.semgrep/` directory containing rule files, when the ast-enforcement stage runs, then semgrep executes against the project's Python sources and exits zero for a clean project ([test](tests/ast-enforcement.integration.test.ts))
- Given a project where language detection reports Python absent, when the ast-enforcement stage runs, then semgrep does not execute ([test](tests/ast-enforcement.integration.test.ts))
- Given a Python project with a semgrep rule violation, when the ast-enforcement stage runs, then the command exits non-zero and reports the violation ([test](tests/ast-enforcement.integration.test.ts))

### Compliance

- ALWAYS: semgrep invocation is gated on `detectPython` reporting present ([test](tests/ast-enforcement.integration.test.ts))
- ALWAYS: semgrep runs via `uv run semgrep --config .semgrep/ --error --quiet` so the project's managed Python environment provides the tool ([review])
- NEVER: invoke semgrep against a project lacking a `pyproject.toml` ([test](tests/ast-enforcement.integration.test.ts))
