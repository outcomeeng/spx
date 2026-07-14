# Python Test

PROVIDES pytest invocation for Python test files in `spx/**/tests/`
SO THAT `spx test` and `spx test passing`
CAN execute Python tests with exclusion flags derived from `spx.config.{toml,json,yaml}`, without modifying `pyproject.toml`

## Assertions

### Scenarios

- Given Python test files in `spx/**/tests/test_*.py`, when the python-testing runner is invoked with a list of paths, then pytest executes against those paths and exits zero for passing tests ([test](tests/python-test.scenario.l2.test.ts))
- Given an excluded node path in `spx.config.{toml,json,yaml}`, when `spx test passing` runs, then pytest is invoked with `--ignore=spx/{node}/` for that node ([test](tests/python-test.scenario.l1.test.ts))
- Given a Python test imports a module that does not exist, when pytest runs against that file without exclusion, then pytest exits non-zero with an ImportError ([test](tests/python-test.scenario.l2.test.ts))
- Given a product where language detection reports Python absent, when `spx test` runs, then pytest is not invoked ([test](tests/python-test.scenario.l1.test.ts))

### Mappings

- Python test file pattern: `test_*.py` — any file matching this pattern under `spx/**/tests/` is a pytest target ([test](tests/python-test.mapping.l1.test.ts))
- Config-driven exclusion flag generation: an excluded node path `{segment}` maps to pytest flag `--ignore=spx/{segment}/` ([test](tests/python-test.mapping.l1.test.ts))

### Compliance

- ALWAYS: pytest invocation is gated on the Python testing descriptor's detection result ([test](tests/python-test.compliance.l1.test.ts))
- ALWAYS: pytest runs via `uv run --active pytest` so the provisioned active Python environment provides the tool ([audit])
- NEVER: write pytest configuration into `pyproject.toml` — exclusion flags pass at invocation time ([audit])
