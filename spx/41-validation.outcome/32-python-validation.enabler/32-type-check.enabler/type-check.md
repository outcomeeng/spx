# Python Type Check

PROVIDES mypy and pyright type checking for Python source code
SO THAT `spx validation typescript` (generalized) and `spx validation all`
CAN run both type checkers against Python projects — catching type errors that neither tool catches alone — while leaving non-Python projects untouched

## Assertions

### Scenarios

- Given a project with Python present and `[tool.mypy]` and `[tool.pyright]` sections in `pyproject.toml`, when the type-check stage runs, then mypy and pyright both execute and exit zero for a clean project ([test](tests/type-check.integration.test.ts))
- Given a project where language detection reports Python absent, when the type-check stage runs, then neither mypy nor pyright executes ([test](tests/type-check.integration.test.ts))
- Given a Python project with a type error, when the type-check stage runs, then the command exits non-zero and at least one of mypy or pyright reports the error ([test](tests/type-check.integration.test.ts))

### Compliance

- ALWAYS: both mypy and pyright run when Python is detected — neither is optional ([test](tests/type-check.integration.test.ts))
- ALWAYS: mypy and pyright run via `uv run` so the project's managed Python environment provides both tools ([review])
- NEVER: treat a pass from one type checker as sufficient when the other fails — both must pass ([test](tests/type-check.integration.test.ts))
