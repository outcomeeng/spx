# Status File Contract

Each spec-tree node's verification outcomes persist in a co-located, machine-written `spx.status.json` file with a schema version and a `verification` object keyed by verification mechanism and evidence reference. The file stores only execution outcomes that Git cannot answer: whether each linked test, eval, or audit evidence reference passed, failed, or did not run, plus per-mechanism overall rollups. The committed file is a claim its author publishes: `spx spec status` derives the node lifecycle state from it when present and from the tracked spec tree when absent, and `spx spec status --update` folds the outcomes a recorded verification run produced into it. Neither command executes verification — a verification surface records evidence when it runs, and the status command reads it.

## Rationale

Per-node co-location ties recorded outcomes to the node's own commits while Git owns identity, provenance, assertions, evidence links, source, config, and history; central status maps, copied Git facts, and top-level lifecycle-only fields lose that boundary. `spx.status.json` is the committed projection of runtime outcomes, distinct from gitignored execution evidence under `.spx/`, and CI recomputes that projection from the checkout so forged or stale status cannot pass on the default branch.

Separating the claim from its reproduction is what lets the status path stay a read: the author folds the evidence a run recorded, and CI — running the configured suite over a full checkout — is the authority that reproduces a passing claim and refutes one the product no longer supports. A status command that executed verification to fill a gap would re-derive per node what a run schedules in one batch, and would write an outcome no recorded run produced.

## Product properties

1. `spx.status.json` has `schemaVersion: 1` and a `verification` object whose mechanism keys are `test`, `eval`, and `audit` when that mechanism has linked evidence for the node; each mechanism object has an `overall` value of `passed`, `failed`, `partial`, or `not-run`, and evidence-reference keys whose values are `passed`, `failed`, or `not-run`.
2. `spx spec status` derives a node's lifecycle state from committed verification outcomes when `spx.status.json` exists and derives live structural state when it is absent; `--update` folds the outcomes a recorded verification run produced: a reference a run covers keeps its committed outcome when that evidence is stale, and a reference no run covers is `not-run`. Neither form executes verification.
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
- ALWAYS: fold `spx spec status --update` verification outcomes from the evidence the configured verification surfaces recorded ([audit])
- ALWAYS: report only derivable state from `spx spec status` without `--update`: the committed verification projection when present, otherwise the live structural derivation ([audit])
- NEVER: treat a missing `spx.status.json` as an error or a fixed state; absence routes to live derivation ([audit])
- NEVER: offer `spx.status.yaml` or `spx.status.toml` — the status file is machine-written JSON only ([audit])
- NEVER: execute verification from `spx spec status` in any form, `--update` included — the status path folds recorded evidence and a verification surface produces it ([audit])
- ALWAYS: keep the committed outcome of an evidence reference a recorded run covers whose evidence is stale — the claim stands until a run records a replacement ([audit])
- NEVER: keep a committed outcome for an evidence reference no recorded run covers — it reads `not-run`, so the regenerated projection refutes a claim no run produces rather than reproducing it ([audit])
