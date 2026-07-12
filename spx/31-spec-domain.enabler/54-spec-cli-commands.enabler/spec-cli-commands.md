# Spec CLI Commands

PROVIDES deterministic `spx spec status` and `spx spec next` command handlers over the current spec-tree library surface
SO THAT agents and developers working in a product checkout
CAN inspect current node state and select the next non-passing node without hand-walking `spx/`

## Assertions

### Scenarios

- Given a tracked `spx/` tree contains current spec-tree nodes, when `spx spec status` reads the tree, then it reports registry labels, node paths, and derived node states from the current spec-tree surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree contains actionable current spec-tree nodes, when `spx spec next` reads the tree, then it reports the first non-passing node selected by the current spec-tree traversal surface ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a tracked `spx/` tree is read from a nested directory inside a git repository, when `spx spec status` and `spx spec next` run, then both commands resolve the product root through the worktree-local git root and read the tracked `spx/` tree ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a command runs outside a git worktree, when `spx spec status` or `spx spec next` falls back to the current working directory, then the command emits a warning and returns deterministic empty-tree output for no current spec-tree nodes ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a node carries a committed `spx.status.json`, when `spx spec status` runs without `--update`, then it derives that node's lifecycle state from the recorded verification outcomes rather than live structural state, and executes no verification ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given an injected in-memory source is supplied with `update: true`, when `spx spec status` runs, then it rejects the request ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a verification surface's recorded evidence for a node is stale, failing, or absent, when `spx spec status --update` runs, then it invokes that surface to obtain the node's outcomes before classifying and writing `spx.status.json` ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a git repository whose `spx/` tree holds both a git-tracked node directory and an untracked, node-shaped directory, when `spx spec status` runs without `--update`, then both are reported as nodes ([test](tests/spec-cli-commands.scenario.l1.test.ts))

### Compliance

- ALWAYS: command handlers operate on tracked `spx/` files using worktree-local root resolution per `spx/15-worktree-management.pdr.md` ([audit])
- ALWAYS: when `spx spec status --update` runs on a tracked `spx/` tree, each node's verification outcomes are written to its co-located `spx.status.json` and the command reports the same rollup `spx spec status` renders ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- ALWAYS: `spx spec status --update` writes node verification outcomes only as `spx.status.json` files within the tracked `spx/` tree, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([audit])
- NEVER: command handlers write to product configuration files such as `spx.config.toml`, `spx.config.json`, `spx.config.yaml`, `package.json`, `pyproject.toml`, or `tsconfig.json` ([test](../76-spec-cli-contract-tests.enabler/tests/spec-cli-contract.scenario.l2.test.ts))
- NEVER: command handlers parse spec-tree suffixes or assemble hierarchy themselves — they consume `src/lib/spec-tree/index.ts` ([audit])
- ALWAYS: `spx spec status --update` obtains each node's verification outcomes from the owning verification surface, never from a status-owned runner, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([audit])
- NEVER: `spx spec status` without `--update` executes verification — it reports state derived from recorded verification outcomes or live structure, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([audit])
- ALWAYS: the per-node test runner the `--update` path composes forwards a run's stdout to the caller-supplied output stream, per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- ALWAYS: `spx spec status --update` supplies `process.stderr` as that output stream, so stdout carries only the status rollup and `--json` output stays machine-parseable, per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` ([audit])
- ALWAYS: `spx spec status --update` classifies a node passing only when the refreshed verification outcomes pass for every linked reference in the applicable surface; a run leaving any linked reference unexecuted records `not-run` and does not pass, per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` ([test](tests/spec-cli-commands.scenario.l1.test.ts))
