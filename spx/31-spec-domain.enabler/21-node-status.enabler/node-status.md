# Node Status

PROVIDES per-node persistence of each spec-tree node's derived lifecycle state — an `spx.status.json` file format, a reader, a writer, and the classification that resolves a node to `declared`, `specified`, `failing`, or `passing` from the testing domain's recorded run evidence — written only by `spx spec status --update`
SO THAT `spx spec status` and other spec-tree status consumers
CAN read a node's last-recorded lifecycle state from a committed file without re-running validation and tests

## Assertions

### Scenarios

- Given a tracked `spx/` tree, when `spx spec status --update` runs, then each node directory holds an `spx.status.json` recording that node's classified lifecycle state ([test](tests/node-status.scenario.l1.test.ts))
- Given a node directory has no `spx.status.json`, when a consumer reads that node's lifecycle state, then the consumer derives the state live rather than reading a file ([test](tests/node-status.scenario.l1.test.ts))
- Given a node with co-located tests not listed in `spx/EXCLUDE` whose recorded testing evidence is stale, failing, or absent, when `spx spec status --update` classifies that node, then it invokes the testing per-node run to obtain the node's pass/fail outcome before recording state ([test](tests/node-status.scenario.l1.test.ts))

### Mappings

- Classification resolves each node to one lifecycle state in precedence order: a node with no co-located tests resolves to `declared`; otherwise a node listed in `spx/EXCLUDE` resolves to `specified`; otherwise a node whose tests all pass resolves to `passing`; otherwise the node resolves to `failing` ([test](tests/node-status.mapping.l1.test.ts))

### Properties

- Every `spx.status.json` the writer produces parses as a JSON object whose `status` is one of `declared`, `specified`, `failing`, `passing` ([test](tests/node-status.property.l1.test.ts))

### Compliance

- ALWAYS: `spx.status.json` is written only by the `spx spec status --update` path ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: each `spx.status.json` is co-located in the directory of the node it describes; node identity comes from file location, not file content ([review])
- ALWAYS: `spx spec status --update` derives the pass/fail input only for a node whose classification reaches the test-outcome stage — co-located tests present and not in `spx/EXCLUDE` — from the testing domain's recorded evidence, invoking the testing per-node run only when that evidence is stale, failing, or absent; `declared` and `specified` nodes classify structurally without a run ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: a consumer treats a missing `spx.status.json` as an error or a fixed state — absence routes to live derivation ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: `spx.status.json` is hand-authored or offered as `spx.status.yaml`/`spx.status.toml` — it is a machine-written JSON artifact ([review])
- NEVER: the status path composes a language-specific test runner — the per-node run is the testing domain's registry-based, multi-language surface ([review])

## Notes

The file contract — filename, location, JSON-only format, writer authority, and absence semantics — is governed by `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`. The `spx spec status --update` command surface is specified in `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/spec-cli-commands.md`. Staleness detection is outside this node's scope.
