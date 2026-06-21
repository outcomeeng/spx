# Status File Contract

Each spec-tree node's lifecycle state persists in a co-located, machine-written `spx.status.json` file — `{ "status": "declared" | "specified" | "failing" | "passing" }` — written only by `spx spec status --update`, where a missing file means "no recorded state" and consumers derive that node's state live. `spx spec status --update` derives a node's state from the testing domain's recorded run evidence, triggering the testing domain's per-node run only when that evidence is stale, failing, or absent; `spx spec status` without `--update` reports recorded state and runs no tests.

## Rationale

Per-node co-location ties a node's recorded state to that node's own commits, so git history — not a field inside the file — answers "when did this node last pass?". A single writer keeps every other path a pure reader, so reading status never mutates the tree. Absence routing to live derivation makes the mechanism additive: status works on a fresh checkout before any `--update` has run, and a missing file is never an error.

Status records a node's lifecycle classification; the testing domain owns test execution and its raw run evidence (`spx/41-test.enabler/test.md`). The two artifacts are distinct and both persist: `spx.status.json` records the four-state lifecycle classification, and the testing domain's run evidence records runner outcomes, digests, and timestamps. `spx spec status --update` consumes that evidence rather than executing tests itself, so one execution path — the testing domain's registry-based, multi-language run — produces every test outcome and status never embeds a language-specific runner.

Alternatives rejected:

- A single central status file at the `spx/` root mapping node paths to state — centralizes per-node state away from the node and creates cross-branch merge contention.
- Multiple formats (`spx.status.{json,yaml,toml}`) mirroring `spx.config.*` — config is human-authored, so ergonomic formats help; the status file is machine-written, so one canonical JSON format is correct.
- `spx spec status --update` executing node tests directly — duplicates the testing domain's runner dispatch and forces status to know each language's runner; delegating to testing keeps execution single-sourced and multi-language.

## Product invariants

- `spx spec status` reflects a node's last `spx spec status --update` result for any node with a committed `spx.status.json`.
- A node with no `spx.status.json` reports the same live-derived state it did before any `--update` ran.
- `spx spec status` without `--update` executes no node tests: it reports the persisted `spx.status.json` when present and the live structural derivation otherwise, within the per-command latency budget in `spx/spx.product.md` (under 100ms once the CLI process is running).
- `spx spec status --update` reflects the testing domain's recorded evidence when that evidence is usable — fresh and passing — and triggers a fresh per-node test run only when the recorded evidence is stale, failing, or absent.

## Verification

### Audit

- ALWAYS: write `spx.status.json` only through the `spx spec status --update` path — every other path reads ([audit])
- ALWAYS: place each `spx.status.json` in the directory of the node it describes; node identity comes from file location, not file content ([audit])
- ALWAYS: record the lifecycle state as a JSON `status` field whose value is one of `declared`, `specified`, `failing`, `passing` ([audit])
- ALWAYS: derive `spx spec status --update` state from the testing domain's recorded run evidence, triggering the testing domain's per-node run only when that evidence is stale, failing, or absent ([audit])
- ALWAYS: report only derivable state from `spx spec status` without `--update` — the persisted `spx.status.json` when present, otherwise the live structural derivation ([audit])
- NEVER: treat a missing `spx.status.json` as an error or a fixed state — absence routes to live derivation ([audit])
- NEVER: offer `spx.status.yaml` or `spx.status.toml` — the status file is machine-written JSON only ([audit])
- NEVER: execute node tests from `spx spec status` without `--update` ([audit])
- NEVER: compose a language-specific test runner inside the status path — test execution is delegated to the testing domain's registry-based run ([audit])
