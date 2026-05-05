# Python Detection

PROVIDES identification of projects that use Python
SO THAT Python-specific tools (validation stages and test runners)
CAN determine whether to run against the current project root

## Assertions

### Scenarios

- Given a project root containing `pyproject.toml`, when Python detection runs, then it reports Python present ([test](tests/python.property.l1.test.ts))
- Given a project root with no `pyproject.toml`, when Python detection runs, then it reports Python absent ([test](tests/python.property.l1.test.ts))

### Compliance

- ALWAYS: the marker file for Python is `pyproject.toml` in the project root ([test](tests/python.property.l1.test.ts))
- NEVER: return true for Python presence based on `.py` file extensions — detection uses marker files only ([review])
