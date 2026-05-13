# Spec CLI Commands

PROVIDES deterministic `spx spec status` and `spx spec next` command handlers over the current spec-tree library surface
SO THAT agents and developers working in a product checkout
CAN inspect current node state and select the next non-passing node without hand-walking `spx/`

## Assertions

### Scenarios

- Given a tracked `spx/` tree contains current spec-tree nodes, when `spx spec status` reads the tree, then it reports registry labels, node paths, and derived node states from the current spec-tree surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree contains actionable current spec-tree nodes, when `spx spec next` reads the tree, then it reports the first non-passing node selected by the current spec-tree traversal surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree is read from a nested directory inside a git worktree, when `spx spec status` and `spx spec next` run, then both commands resolve the product root through the worktree-local git root and read the tracked `spx/` tree ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a command runs outside a git worktree, when `spx spec status` or `spx spec next` falls back to the current working directory, then the command emits a warning and returns deterministic empty-tree output for no current spec-tree nodes ([test](tests/spec-cli-commands.scenario.l1.test.ts))

### Compliance

- ALWAYS: command handlers operate on tracked `spx/` files using worktree-local root resolution per `spx/15-worktree-resolution.pdr.md` ([review])
- NEVER: command handlers write to product configuration files such as `spx.config.toml`, `spx.config.json`, `spx.config.yaml`, `package.json`, `pyproject.toml`, or `tsconfig.json` ([review])
- NEVER: command handlers parse spec-tree suffixes or assemble hierarchy themselves — they consume `src/lib/spec-tree/index.ts` ([review])
