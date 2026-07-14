# Spec Domain

PROVIDES intermediate composition operations that coordinate spec-tree library capabilities for navigation, status projection, next-work selection, and methodology progress
SO THAT CLI, MCP, API, and UI surfaces
CAN expose spec-tree workflows without owning traversal, state derivation, persistence, testing, or rendering-neutral orchestration semantics

## Assertions

### Compliance

- ALWAYS: compose lower-index spec-tree, testing, validation, and persistence capabilities through their public contracts before any surface renders the result ([audit])
- Under `spx/15-worktree-management.pdr.md`, ALWAYS: operate on tracked `spx/` files using the worktree-local root ([audit])
- NEVER: own spec-tree traversal, node-state derivation, persistence, testing, validation, or surface rendering semantics ([audit])
- NEVER: modify files outside the product root ([audit])
- NEVER: write to product configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`) — spec-tree operations stay within the `spx/` tree ([audit])
