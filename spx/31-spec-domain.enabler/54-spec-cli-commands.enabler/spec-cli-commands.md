---
malleability: spec
---

# Spec CLI Commands

PROVIDES deterministic `spx spec status`, `spx spec next`, and `spx spec context` command handlers over the spec-tree library surface
SO THAT agents and developers working in a product checkout
CAN inspect node state, select the next non-passing node, discover relevant subtrees, and load deterministic context without hand-walking `spx/`

## Assertions

- Given one or more accepted targets, when `spx spec context list <targets...>` runs, then it emits the context library's versioned structural manifest for those targets
- Given zero or more targets, when `spx spec context show [targets...]` runs, then it emits the context library's targetless or targeted document projection
- Given `--methodology` and `--coding-agent <name>`, when `spx spec context show` runs, then it accepts both options
- Given `list` or `show`, when `--json` is supplied, then only the representation changes
- NEVER: `spx spec context show` or `spx spec context list` registers a `--content` or `--understand` option
- Given the packaged executable and a tracked node with linked evidence, when `spx spec status --update` runs through the process boundary, then its output reports the same rollup that a subsequent `spx spec status` invocation renders

### Scenarios

- Given a tracked `spx/` tree contains spec-tree nodes, when `spx spec status` reads the tree, then it reports registry labels, node paths, and derived node states from the spec-tree library surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree contains actionable spec-tree nodes, when `spx spec next` reads the tree, then it reports the first non-passing node selected by the spec-tree library's traversal surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree is read from a nested directory inside a git repository, when `spx spec status` and `spx spec next` run, then both commands resolve the product root through the worktree-local git root and read the tracked `spx/` tree ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a command runs outside a git worktree, when `spx spec status` or `spx spec next` falls back to the current working directory, then the command emits a warning and returns deterministic empty-tree output carrying no spec-tree nodes ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a node carries a committed `spx.status.json`, when `spx spec status` runs without `--update`, then it derives that node's lifecycle state from the recorded verification outcomes rather than live structural state, and executes no verification ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given an injected in-memory source is supplied with `update: true`, when `spx spec status` runs, then it rejects the request ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked node has linked evidence, when the `spx spec status --update` handler writes its projection, then the handler reports the same rollup that a subsequent `spx spec status` read renders ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a git repository whose `spx/` tree holds both a git-tracked node directory and an untracked, node-shaped directory, when `spx spec status` runs without `--update`, then both are reported as nodes ([test](tests/spec-cli-commands.scenario.l1.test.ts))

### Mappings

- Recorded test evidence maps to each linked reference as follows: a fresh covering outcome maps the reference to its own test file's recorded verdict (`passed`, `failed`, or `not-run`), independent of the verdict of every other file the same run covered; a covered stale outcome keeps the committed outcome; and an uncovered reference maps to `not-run` ([test](tests/spec-status-fold.mapping.l1.test.ts))

### Compliance

- ALWAYS: command handlers operate on tracked `spx/` files using worktree-local root resolution per [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md) ([audit])
- ALWAYS: `spx spec status --update` writes node verification outcomes only as `spx.status.json` files within the tracked `spx/` tree, per [spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md](spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md) ([audit])
- NEVER: command handlers parse spec-tree suffixes or assemble hierarchy themselves — they consume `src/lib/spec-tree/index.ts` ([audit])
- ALWAYS: `spx spec status --update` obtains each node's verification outcomes from recorded evidence produced by the owning verification surface, never from a status-owned runner, per [spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md](spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md) ([audit])
- NEVER: `spx spec status` executes verification in any form — with or without `--update`, it reports state derived from recorded verification outcomes or live structure, per [spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md](spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md) ([test](tests/status-testing-delegation.compliance.l1.test.ts))
