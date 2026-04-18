# Python Testing

PROVIDES pytest invocation for Python test files in `spx/**/tests/`
SO THAT `spx test` and `spx test passing`
CAN execute Python tests with exclusion flags derived from `spx/EXCLUDE`, without modifying `pyproject.toml`

## Assertions

### Scenarios

- Given Python test files in `spx/**/tests/test_*.py`, when the python-testing runner is invoked with a list of paths, then pytest executes against those paths and exits zero for passing tests ([test](tests/python-testing.integration.test.ts))
- Given an excluded node in `spx/EXCLUDE`, when `spx test passing` runs, then pytest is invoked with `--ignore=spx/{node}/` for that node ([test](tests/python-testing.integration.test.ts))
- Given a Python test imports a module that does not exist, when pytest runs against that file without exclusion, then pytest exits non-zero with an ImportError ([test](tests/python-testing.integration.test.ts))
- Given a project where language detection reports Python absent, when `spx test` runs, then pytest is not invoked ([test](tests/python-testing.integration.test.ts))

### Mappings

- Python test file pattern: `test_*.py` — any file matching this pattern under `spx/**/tests/` is a pytest target ([test](tests/python-testing.unit.test.ts))
- Exclusion flag generation: an excluded node path `{segment}` maps to pytest flag `--ignore=spx/{segment}/` ([test](tests/python-testing.unit.test.ts))

### Compliance

- ALWAYS: pytest invocation is gated on `detectPython` reporting present ([test](tests/python-testing.integration.test.ts))
- ALWAYS: pytest runs via `uv run pytest` so the project's managed Python environment provides the tool ([review])
- NEVER: write pytest configuration into `pyproject.toml` — exclusion flags pass at invocation time ([review])
