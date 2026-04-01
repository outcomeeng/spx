# Spec Domain

WE BELIEVE THAT providing CLI commands to manage spec-tree state in project tool configurations
WILL cause agents and developers to maintain consistent spec-tree integration with project tooling
CONTRIBUTING TO reduced configuration drift and fewer quality gate failures from misaligned tool configs

## Assertions

### Scenarios

- Given a project with `spx/EXCLUDE` and `pyproject.toml`, when `spx spec apply` is run, then tool configurations are updated to match the exclusion list ([test](21-apply.enabler/21-apply-exclude.enabler/tests/apply-exclude.unit.test.ts))

### Compliance

- ALWAYS: operate on tracked `spx/` files using worktree-local root per PDR-15 ([review](../15-worktree-resolution.pdr.md))
- NEVER: modify files outside the project root ([review])
