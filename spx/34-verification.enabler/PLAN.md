# Plan: verification domain

> Reconcile against `spx/PLAN.md`, `spx/spx.product.md`, `spx/34-verification.enabler/verification.md`, and the affected child specs and decisions first. This note is coordination, not product truth. The methodology model it implements lives in the external Outcome Engineering reference (`reference/spec-tree-reference.md`): verification is the five types, and the node status claim supersedes the exclusion list.

## Program: test verification recording and claim

This is the authoritative, all-slice plan for making `test` a first-class verification type whose execution is recorded as a snapshot and folded into the node status claim. The claim-side detail is cross-referenced from `spx/31-spec-domain.enabler/21-node-status.enabler/PLAN.md`, which points back here.

### The corrected model (why this program exists)

- **Verification is the five types** — validate, test, evaluate, audit, review. `test` is a first-class verification type, not a separate track. The current split (deterministic `spx test`/`validation` walled off from the verification-run recording) is a relic; `spx/34-verification.enabler/verification.md` line 21 and `spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md` still encode that split and are slated to change.
- **Persistence has three shapes — records, journals, snapshots** (`spx/PLAN.md`; `spx/18-state.enabler`). A test run is a **snapshot**: one whole-payload projection written once, not an append-only event history. The **journal** (`spx/15-agent-run-journal.enabler`, `spx/18-state.enabler/71-appendable-journal-store.enabler`) is a separate substrate for agentic runs; its `SnapshotBackend` port is misnamed and GitHub-only. Test recording must **not** couple to anything named `journal`/`agent`.
- **Claim vs. verification.** The committed `spx.status.json` is a **claim** authored by whoever pushes; **CI is the arbiter** that reproduces claimed-passing evidence and refutes regressions. `spx spec status --update` **folds** available local evidence into the claim and **executes nothing**. The present behaviour — `--update` re-running per-node tests when recorded evidence is stale/failing/absent (`spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/21-status-testing-delegation.adr.md`) — is the relic that produces the whole-tree serial re-run (observed: one failing test → 60 serial vitest processes, ~7m42s vs a 2m07s batch). It is replaced by fold-only.
- **The spec→test→source graph is the addressing spine** (`spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler`: `21-spec`, `32-test`, `43-source`). The test graph maps which test file is evidence for which node (claim addressing); the source graph derives staleness from spec-linked tests plus provider facts, **not language import graphs alone** (`.../11-graph-library-boundary.adr.md`, `21-graph.enabler/graph.md`). Today discovery/changed-set uses the TypeScript import-closure walker (`src/test/languages/typescript.ts`) — the "garbage" the graph replaces. This program **reuses that discovery as-is and adds nothing to it**; the graph is a later slice.

### Layering (per `spx/14-cli-composition.adr.md`)

Every piece follows library → domain composition → CLI surface, with reusable libraries under `src/lib/`:

| Layer                               | Modules                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| library (`src/lib/`)                | reuse `src/lib/state-store/` (`.spx/` addressing); **new** snapshot-store lib over it; `src/lib/spec-tree/` + `src/lib/node-status/` (claim fold) |
| domain (`src/domains/`)             | `src/domains/verify/` — register the `test` type's snapshot evidence validator + terminal derivation (pure)                                       |
| command (`src/commands/`)           | `src/commands/verify/` — orchestrate: invoke the test-domain runner, project JSON → snapshot, persist via the snapshot-store lib                  |
| CLI surface (`src/interfaces/cli/`) | `src/interfaces/cli/verify.ts` — `spx verification run --verification-type=test`. The snapshot store and the journal are **never** exposed.       |

### Slice 1 — atomic snapshot vertical (TypeScript)

**Demonstrable value:** `spx verification run --verification-type=test <scope>` invokes vitest **once** over the selected TypeScript files (no streaming), captures the atomic end-of-run JSON, projects it into a **per-case snapshot**, persists it in the snapshot store (scope-addressed by worktree/branch, one immutable artifact per run, multiple per address), and `spx spec status --update` **folds** real per-reference outcomes into `spx.status.json` **executing nothing** — a passing and a failing test file in one node resolve independently.

Vitest evidence: the built-in `json` reporter is **atomic** — `JsonReporter.onTestRunEnd` builds the whole result and `writeReport` does one `writeFile` at completion (`vitest/dist/chunks/index.UpGiHP7g.js`). Per-case streaming exists via `onTestCaseResult`, but that is the observability slice, not this one.

Node set (`/apply` order; existing = reuse, NEW = compose):

1. **NEW** `spx/18-state.enabler/71-snapshot-store.enabler` — whole-payload snapshot persistence; **multiple immutable snapshots per scope** (record-store-style run artifacts: no clobber, round-to-round comparison, stable home replacing temp-`outputFile` chasing); reuses `spx/18-state.enabler/43-record-store.enabler` run-file mechanics over `spx/18-state.enabler/32-scope-addressing.enabler`; same-index peer of `spx/18-state.enabler/71-appendable-journal-store.enabler`; **NEVER** imports or binds `spx/15-agent-run-journal.enabler` or `spx/18-state.enabler/71-appendable-journal-store.enabler`. Index 71 confirmed by ordering evidence (consumes `43-record-store`; independent peer of `71-appendable-journal-store`).
2. **NEW** `test` verification type under `spx/34-verification.enabler/32-verify.enabler/` (peer of `65-audit`/`65-review`) — registers the snapshot as its evidence kind through the evidence-validator registry (`spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`) and derives terminal status from it. Consumes the core lifecycle (`21-run-context`, `32-evidence-append`, `43-terminal-projection`); does **not** consume `54-run-set-orchestration` (no cross-run finding identity for a deterministic snapshot), so it is not a same-index peer of audit/review.
3. **REUSE/extend** `spx/41-test.enabler/21-typescript-test.enabler` — vitest adapter emits `--reporter=json --outputFile=<path>` and returns the JSON path, not just the exit code; reuse `spx/41-test.enabler/85-agent-test-output.enabler` capture-to-file primitive.
4. **NEW** snapshot projection (vitest JSON → per-case snapshot document) — placement (`spx/41-test.enabler` vs. the new `test` type node) settled in `/decompose` when this slice reaches it.
5. **REUSE/extend** `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification-command-family.enabler` — `--verification-type=test` wiring.
6. **REUSE/extend** `spx/31-spec-domain.enabler/21-node-status.enabler` — additive fold-from-snapshot path in `--update` (beside the existing path); maps test file → node via existing spec-tree evidence references.

Reused untouched: the journal backend, existing discovery / `spx/41-test.enabler/95-changed-set-planning.enabler` (add nothing).

Boundaries — **in:** TypeScript only; one vitest invocation; atomic JSON → per-case snapshot; the snapshot-store node; the `test` type; `--update` fold; `spx/EXCLUDE` still in force. **out:** streaming observability; the graph; `EXCLUDE` removal; `TestRunState` retirement; Python; any journal/agent coupling; moving `spx test` under `spx verification run`.

Route: `/decompose spx/18-state.enabler` (snapshot-store node) → `/decompose spx/34-verification.enabler/32-verify.enabler` (test type) → `/author` specs → `/apply` per node in index order → `/merge`.

### Slice 2 — authored lifecycle status; retire `spx/EXCLUDE`

**Demonstrable value:** `spx.status.json` carries an **authored** lifecycle status (`declared`/`specified`) — a hand-written "intentionally not passing yet" marker distinct from the machine-folded per-reference evidence outcomes. A node bearing it is **not discovered or run**, **not recorded as failing**, and **honored by CI** (passes the gate without its tests running). This lets authors write spec + test files without an implementation, keeps CI green, wastes no time discovering tests whose implementation does not exist, and **removes `spx/EXCLUDE`** — the per-node claim scopes the gate in its own committed record.

Detail (owned by `spx/31-spec-domain.enabler/21-node-status.enabler/PLAN.md`, summarized here):

- **Status-file contract** (`spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`): add an authored lifecycle field beside the machine-folded evidence outcomes. Two concerns — the author owns the lifecycle intent; `--update` owns the evidence.
- **Fold:** `--update` folds per-reference evidence but **never overwrites the authored lifecycle status**; a `specified` node stays `specified` when evidence is absent or failing, never downgraded to `failing`.
- **Verification run / discovery:** skip nodes authored `declared`/`specified` (no wasted discovery, no failing record for absent implementations).
- **CI:** reproduces/refutes only nodes whose authored status expects passing; `declared`/`specified` nodes are not run and pass the gate.
- **Remove `spx/EXCLUDE`**; update the `CLAUDE.md` no-hand-edit rule so the lifecycle field is authorable while `passed`/`failed`/`not-run` evidence values stay machine-only.
- Governed by `15-status-file-contract.pdr.md` + `21-node-status-architecture.adr.md`. Reconcile with node-status's own evacuation plan (that node is slated to shrink; the authored-status contract may land in its future backend/spec-tree home).

### Later slices (deferred, defined)

- **Live observability.** For runs that rival agentic verification in length (~10 min), stream progress so agents and operators can inspect mid-run. Vitest supplies `onTestCaseResult` per-case events; a custom incremental reporter or tailable stdout capture into the scope. Generation streams (journal-shaped) while the durable artifact stays a snapshot.
- **Spec→test→source graph.** Materialize `spx/25-outcomeeng.enabler/31-spec-tree.enabler/21-graph.enabler` to replace the import-closure discovery/changed-set and to provide source-ownership staleness (source graph). This is the correct discovery/addressing spine the earlier slices reuse the relic for.
- **Retire the relic path.** Once the snapshot→fold→claim path is authoritative, retire the coarse `TestRunState` per-group recording (`spx/41-test.enabler/43-last-run-evidence.enabler`) and the `--update`-executes-tests behavior.
- **Python `test` verification type.** Extend the pytest adapter to the same snapshot recording (architecture is language-neutral through the registry; only TypeScript is built in slice 1).

## Prior coordination: verify command lifecycle

> Preserved from the earlier verify-command plan; still applies to the `spx/34-verification.enabler/32-verify.enabler` lifecycle cleanup, independent of the program above.

### Harness vocabulary alignment

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

`spx/12-agent-harness.pdr.md` includes top-level domains that journal verification runs executed by coding agents. Align this node's specs, verify lifecycle vocabulary, and verification-run vocabulary so the run journal is described as evidence for verification runs executed by agents, distinct from agent sessions, agent adapters, and SPX handoff session files. Keep CLI command names, help text, rendering, and bounded-output rules out of this library node; the `spx verification run` and `spx journal` command surfaces live under `spx/60-surfaces.enabler/21-cli-surface.enabler`.

1. Apply the parent `spx/34-verification.enabler/32-verify.enabler` cross-lifecycle assertions: lock the full operation mapping and the journal-event boundary, extend the existing-run scope-type and changeset-scope validation uniformly to the `input`, evidence-scope-add, and evidence-finding-add operations (the finish, status, and render operations already validate through `resolveExistingRun`), add the `spx verification run` descriptor's L2 CLI test for stdin and Commander wiring, then remove the parent entry from `spx/EXCLUDE` as its implementation begins passing.
2. Continue under `spx/34-verification.enabler/32-verify.enabler/PLAN.md`. That child plan owns run-set orchestration for repeated runs with expanding scope, and same-index type-specific nodes for `review` and `audit`.
3. Keep prompt wording changes separate from the CLI-interface slice; the command contract is the durable interface that prompt cleanup consumes.
