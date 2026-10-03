---
malleability: spec
---

# Spec CLI Commands

PROVIDES deterministic `spx spec status`, `spx spec next`, and `spx spec context` command handlers over the spec-tree library surface
SO THAT agents and developers working in a product checkout
CAN inspect current node state, select the next non-passing node, discover relevant subtrees, and load deterministic context without hand-walking `spx/`

## Assertions

### Scenarios

- Given one or more accepted targets, when `spx spec context list <targets...>` runs, then it emits the context library's versioned structural manifest for those targets ([test](tests/spec-context-commands.scenario.l1.test.ts))
- Given zero or more targets, when `spx spec context show [targets...]` runs, then it emits the context library's targetless or targeted document projection ([test](tests/spec-context-commands.scenario.l1.test.ts))
- Given `--methodology` and `--coding-agent <name>`, when `spx spec context show` runs, then it accepts both options ([test](tests/spec-context-commands.scenario.l1.test.ts))
- Given `list` or `show`, when `--json` is supplied, then only the representation changes ([test](tests/spec-context-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree contains current spec-tree nodes, when `spx spec status` reads the tree, then it reports registry labels, node paths, and derived node states from the current spec-tree surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree contains actionable current spec-tree nodes, when `spx spec next` reads the tree, then it reports the first non-passing node selected by the current spec-tree traversal surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree is read from a nested directory inside a git repository, when `spx spec status` and `spx spec next` run, then both commands resolve the product root through the worktree-local git root and read the tracked `spx/` tree ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a command runs outside a git worktree, when `spx spec status` or `spx spec next` falls back to the current working directory, then the command emits a warning and returns deterministic empty-tree output for no current spec-tree nodes ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a node carries a committed `spx.status.json`, when `spx spec status` runs without `--update`, then it derives that node's lifecycle state from the recorded verification outcomes rather than live structural state, and executes no verification ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given an injected in-memory source is supplied with `update: true`, when `spx spec status` runs, then it rejects the request ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked node has linked evidence, when the `spx spec status --update` handler writes its projection, then the handler reports the same rollup that a subsequent `spx spec status` read renders ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given the packaged executable and a tracked node with linked evidence, when `spx spec status --update` runs through the process boundary, then its output reports the same rollup that a subsequent `spx spec status` invocation renders ([test](tests/spec-cli-commands.scenario.l2.test.ts))
- Given a git repository whose `spx/` tree holds both a git-tracked node directory and an untracked, node-shaped directory, when `spx spec status` runs without `--update`, then both are reported as nodes ([test](tests/spec-cli-commands.scenario.l1.test.ts))

### Mappings

- Recorded test evidence maps to each linked reference as follows: a fresh covered passing outcome maps to `passed`; a fresh covered failing outcome maps to `failed`; a covered stale outcome keeps the committed outcome; and an uncovered reference maps to `not-run` ([test](tests/spec-status-fold.mapping.l1.test.ts))

### Compliance

- ALWAYS: command handlers operate on tracked `spx/` files using worktree-local root resolution per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: `spx spec status --update` writes node verification outcomes only as `spx.status.json` files within the tracked `spx/` tree, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([audit])
- NEVER: command handlers write to product configuration files such as `spx.config.toml`, `spx.config.json`, `spx.config.yaml`, `package.json`, `pyproject.toml`, or `tsconfig.json` ([test](tests/spec-cli-commands.compliance.l1.test.ts))
- NEVER: `spx spec context show` or `spx spec context list` registers a `--content` or `--understand` option ([test](tests/spec-cli-commands.compliance.l1.test.ts))
- NEVER: command handlers parse spec-tree suffixes or assemble hierarchy themselves — they consume `src/lib/spec-tree/index.ts` ([audit])
- ALWAYS: `spx spec status --update` obtains each node's verification outcomes from recorded evidence produced by the owning verification surface, never from a status-owned runner, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([audit])
- NEVER: `spx spec status` executes verification in any form — with or without `--update`, it reports state derived from recorded verification outcomes or live structure, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([test](tests/status-testing-delegation.compliance.l1.test.ts))
