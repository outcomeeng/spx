# Python Detection

PROVIDES identification of products that use Python
SO THAT Python-specific tools (validation stages and test runners)
CAN determine whether to run against the current product root

## Assertions

### Scenarios

- Given a product root containing `pyproject.toml`, when Python detection runs, then it reports Python present ([test](tests/python.scenario.l1.test.ts))
- Given a product root with no `pyproject.toml`, when Python detection runs, then it reports Python absent ([test](tests/python.scenario.l1.test.ts))

### Compliance

- ALWAYS: the marker file for Python is `pyproject.toml` in the product root ([test](tests/python.compliance.l1.test.ts))
- NEVER: return true for Python presence based on `.py` file extensions — detection uses marker files only ([test](tests/python.compliance.l1.test.ts))
