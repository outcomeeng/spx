# Node Status

PROVIDES per-node persistence of each spec-tree node's runtime verification outcomes — an `spx.status.json` file format with `schemaVersion` and mechanism-keyed `verification` results, a reader, a writer, and the classification that resolves a node to `declared`, `specified`, `failing`, or `passing` from the committed outcomes and tracked spec structure — written only by `spx spec status --update`
SO THAT `spx spec status` and other spec-tree status consumers
CAN read a node's last-recorded verification projection from a committed file without re-running verification

## Assertions

### Scenarios

- Given a node directory has no `spx.status.json`, when a consumer reads that node's lifecycle state, then the consumer derives the state live rather than reading a file ([test](tests/node-status.scenario.l1.test.ts))
- Given a node with linked verification references, when `spx spec status --update` refreshes that node, then it records outcomes only for those linked references before deriving the lifecycle projection ([test](tests/node-status.scenario.l1.test.ts))

### Mappings

- Classification resolves each node to one lifecycle state in precedence order: a node with no linked verification references resolves to `declared`; otherwise a node listed in `spx/EXCLUDE` resolves to `specified`; otherwise a node whose committed verification outcomes all pass resolves to `passing`; otherwise the node resolves to `failing` ([test](tests/node-status.mapping.l1.test.ts))
- Verification mechanism rollups map to lifecycle input as follows: every referenced evidence outcome `passed` maps `overall` to `passed`, any `failed` maps `overall` to `failed`, mixed `passed` and `not-run` outcomes map `overall` to `partial`, and all `not-run` outcomes map `overall` to `not-run` ([test](tests/node-status.mapping.l1.test.ts))

### Properties

- Every `spx.status.json` the writer produces parses as a JSON object with `schemaVersion: 1` and a `verification` object whose mechanism keys are `test`, `eval`, or `audit`, whose `overall` values are `passed`, `failed`, `partial`, or `not-run`, and whose evidence-reference values are `passed`, `failed`, or `not-run` ([test](tests/node-status.property.l1.test.ts))

### Compliance

- ALWAYS: `spx spec status --update` writes an `spx.status.json` file in each tracked node directory, recording schema version 1 verification outcomes for that node's linked verification references ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: `spx.status.json` is written only by the `spx spec status --update` path ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: each `spx.status.json` is co-located in the directory of the node it describes; node identity comes from file location, not file content ([audit])
- ALWAYS: `spx.status.json` stores only runtime verification outcomes; node identity, assertion text, evidence links, test source, eval definitions, audit rules, configuration, commit identity, authorship, and timestamps come from Git ([audit])
- ALWAYS: `spx spec status --update` derives pass/fail/not-run outcomes only for linked verification references and obtains those outcomes from the owning verification surface; `declared` and `specified` nodes classify structurally without a run ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: CI regenerates every committed `spx.status.json` from the checkout after running the configured verification suite and rejects a mismatch ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: a consumer treats a missing `spx.status.json` as an error or a fixed state — absence routes to live derivation ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: `spx spec status --update` writes `spx.status.json` into a node-shaped directory with no git-tracked file under it; such a directory is excluded from the update node set and any stale `spx.status.json` already there is removed ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: the git-tracked boundary is the node directory — `spx spec status --update` records a git-tracked node directory's evidence in full, including an evidence file under it that is not yet individually tracked ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: `spx.status.json` is hand-authored or offered as `spx.status.yaml`/`spx.status.toml` — it is a machine-written JSON artifact ([audit])
- NEVER: the status path composes a test runner or executes verification — it folds the outcomes a verification surface recorded, and a reference with no recorded evidence keeps its committed outcome ([audit])
