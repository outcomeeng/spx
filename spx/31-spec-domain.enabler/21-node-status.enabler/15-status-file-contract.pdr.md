# Status File Contract

Each spec-tree node's verification outcomes persist in a co-located, machine-written `spx.status.json` file with a schema version and a `verification` object keyed by verification mechanism and evidence reference. The file stores only execution outcomes that Git cannot answer: whether each linked test, eval, or audit evidence reference passed, failed, or did not run, plus per-mechanism overall rollups. `spx spec status` derives the node lifecycle state from the committed `spx.status.json` when present and from the tracked spec tree when absent; `spx spec status --update` refreshes the file from the configured verification surfaces that own the linked evidence.

## Rationale

Per-node co-location ties recorded outcomes to the node's own commits while Git owns identity, provenance, assertions, evidence links, source, config, and history; central status maps, copied Git facts, and top-level lifecycle-only fields lose that boundary. `spx.status.json` is the committed projection of runtime outcomes, distinct from gitignored execution evidence under `.spx/`, and CI recomputes that projection from the checkout so forged or stale status cannot pass on the default branch.

## Product properties

1. `spx.status.json` has `schemaVersion: 1` and a `verification` object whose mechanism keys are `test`, `eval`, and `audit` when that mechanism has linked evidence for the node; each mechanism object has an `overall` value of `passed`, `failed`, `partial`, or `not-run`, and evidence-reference keys whose values are `passed`, `failed`, or `not-run`.
2. `spx spec status` derives a node's lifecycle state from committed verification outcomes when `spx.status.json` exists, derives live structural state when it is absent, and executes no verification without `--update`.
3. CI runs the configured full verification suite, regenerates the status projection for the checkout, and rejects the commit when any committed `spx.status.json` differs from the regenerated projection.

## Verification

### Testing

- ALWAYS: a generated `spx.status.json` contains `schemaVersion: 1` and a `verification` object keyed by verification mechanism and evidence reference ([conformance])
- ALWAYS: `spx spec status` derives lifecycle state from committed verification outcomes when `spx.status.json` exists and falls back to live structural derivation when it is absent ([mapping])
- ALWAYS: CI detects a stale, forged, or missing status projection by regenerating the projection from the checkout after running the configured verification suite and comparing it with committed `spx.status.json` files ([compliance])

### Audit

- ALWAYS: write `spx.status.json` only through the `spx spec status --update` path — every other path reads ([audit])
- ALWAYS: place each `spx.status.json` in the directory of the node it describes; node identity comes from file location, not file content ([audit])
- ALWAYS: store only runtime verification outcomes that Git cannot answer; node identity, assertion text, evidence links, test source, eval definitions, audit rules, config, commit identity, authorship, and timestamps come from Git ([audit])
- ALWAYS: derive `spx spec status --update` verification outcomes from the configured verification surfaces ([audit])
- ALWAYS: report only derivable state from `spx spec status` without `--update`: the committed verification projection when present, otherwise the live structural derivation ([audit])
- NEVER: treat a missing `spx.status.json` as an error or a fixed state; absence routes to live derivation ([audit])
- NEVER: offer `spx.status.yaml` or `spx.status.toml` — the status file is machine-written JSON only ([audit])
- NEVER: execute verification from `spx spec status` without `--update` ([audit])
