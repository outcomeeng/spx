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
- Given a tracked `spx/` tree, when `spx spec status --update` runs, then each node's classified lifecycle state is written to its co-located `spx.status.json` and the command reports the same rollup `spx spec status` renders ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given a node carries a committed `spx.status.json`, when `spx spec status` runs without `--update`, then it reports that node's recorded lifecycle state rather than a re-derived state, and executes no node tests ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- Given the testing domain's recorded evidence for a node is stale, failing, or absent, when `spx spec status --update` runs, then it invokes the testing per-node run to obtain that node's outcome before classifying and writing `spx.status.json` ([test](tests/spec-cli-commands.scenario.l1.test.ts))

### Compliance

- ALWAYS: command handlers operate on tracked `spx/` files using worktree-local root resolution per `spx/15-worktree-resolution.pdr.md` ([review])
- ALWAYS: `spx spec status --update` writes node lifecycle state only as `spx.status.json` files within the tracked `spx/` tree, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([review])
- NEVER: command handlers write to product configuration files such as `spx.config.toml`, `spx.config.json`, `spx.config.yaml`, `package.json`, `pyproject.toml`, or `tsconfig.json` ([test](../76-spec-cli-contract-tests.enabler/tests/spec-cli-contract.scenario.l2.test.ts))
- NEVER: command handlers parse spec-tree suffixes or assemble hierarchy themselves — they consume `src/lib/spec-tree/index.ts` ([review])
- ALWAYS: `spx spec status --update` obtains each node's pass/fail outcome from the testing domain's recorded evidence and its registry-based per-node run, never from a status-owned runner, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([review])
- NEVER: `spx spec status` without `--update` executes node tests — it reports recorded or live-derived state, per `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` ([review])
- ALWAYS: the per-node test runner the `--update` path composes forwards a run's stdout to the caller-supplied output stream, per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` ([test](tests/spec-cli-commands.scenario.l1.test.ts))
- ALWAYS: `spx spec status --update` supplies `process.stderr` as that output stream, so stdout carries only the status rollup and `--json` output stays machine-parseable, per `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md` ([review])
