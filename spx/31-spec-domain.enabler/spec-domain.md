# Spec Domain

PROVIDES deterministic CLI commands that operate on the spec tree — reading tree state, finding work, and supporting the declare → spec → apply methodology
SO THAT agents and developers working within a spec tree
CAN navigate, inspect, and progress nodes through state transitions without hand-walking the filesystem

## Assertions

### Compliance

- ALWAYS: operate on tracked `spx/` files using worktree-local root per PDR-15 ([review](../15-worktree-resolution.pdr.md))
- NEVER: modify files outside the project root ([review])
- NEVER: write to project configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`) — spec-tree operations stay within the `spx/` tree ([review])
