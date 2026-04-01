# Apply

PROVIDES a CLI subcommand that applies spec-tree state to project configuration
SO THAT agents and developers
CAN keep project tool configuration in sync with spec-tree declarations without manual edits

## Assertions

### Scenarios

- Given a project with spec-tree state to apply, when `spx spec apply` is run, then all applicable child operations execute in sequence ([test](21-apply-exclude.enabler/tests/apply-exclude.unit.test.ts))

### Compliance

- NEVER: modify spec-tree files — apply is one-way from spec-tree state to project config ([review])
