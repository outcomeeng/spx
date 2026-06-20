# Plan: Verification restructure — the journal channel

> This PLAN is the durable record of a restructure decided in discussion. It is the
> central context; `spx/36-audit.enabler/PLAN.md` and `spx/46-reviewing.enabler/PLAN.md`
> carry the collapse notes that point here. Details (exact node structure, indices,
> env-var names, CLI verb shapes) are settled DURING execution via `/author`,
> `/decompose`, `/refactor`, `/align`, `/apply`, `/merge` — do not assume this PLAN
> already fixed them.

## The decision

spx does **not** orchestrate agentic verification. **Agents call spx.** The wrapper
sub-agent that runs an auditing or reviewing skill calls the spx CLI to record and
stream its run's events; spx is the journal/streaming channel, never the orchestrator.

Consequences:

- **Remove `spx audit` and `spx review` as subcommands.** Naming a subcommand after a
  verification type is wrong: spx neither spawns nor drives auditors/reviewers, and spx
  must not know the type names.
- **Deterministic types keep their subcommands** — `spx test`, `spx validation` — because
  there spx *does* the work (runs the tools, scores the verdict).
- **One generic, type-agnostic domain: `journal`.** It owns the run-journal channel the
  agentic verification skills bind. The verification type ("audit", "review", or whatever
  comes later) is an **opaque parameter** (env var / option) spx treats as a scope label;
  spx enumerates no types.
- **Verification is the top-level mode.** `15-agent-run-journal.enabler` is demoted from
  top-level to the journal-contract substrate under the verification/journal structure.

## Why (the problem being solved)

Observability. A minutes-long agentic audit/review must reveal its result incrementally
and identically on a local surface and a hosted PR surface: scope advances, each finding
appears as raised, then the final result. The journal streams to its backend on a
~1/minute cadence (~10 updates per run), and **every new file the agent reads is one
appended event**. The driving skill calls spx at each reasonably significant workflow
event.

## Governing decisions (truth flows down from the plugin repo)

These live in the installed plugin product tree at
`~/Code/outcomeeng/plugins/plugins/spx/` and govern this work. Read them before drafting:

- `spx/14-verification.pdr.md` — verification taxonomy (five types, two axes); agentic =
  reviewing + auditing; verifier-context isolation from author context.
- `spx/21-spec-tree.enabler/16-verification.enabler/13-run-journal.adr.md` — the contract:
  append-only journal is the run's sole source of truth; every surface (PR comment, report,
  findings JSON, check summary) is a projection; the skill emits through **one
  backend-neutral channel** binding the backend **at the edge** (local file vs hosted PR
  comment), swappable without changing the skill; verbs `append`, `read --from <cursor>`,
  `seal`, `render`.
- `spx/21-spec-tree.enabler/16-verification.enabler/21-thread-store.enabler/21-backend-abstraction.adr.md`
  — env-var backend selection (prior form `SPX_VERIFY_BACKEND` default `local`,
  `SPX_VERIFY_BRANCH` scope override); CRUD facade; canonical branch-slug from
  changeset-scope. This is the env-var/edge model spx must realize.
- `spx/15-audit-result-delivery.pdr.md` — incremental reveal; same shape on local and PR
  surfaces.
- `spx/21-spec-tree.enabler/16-verification.enabler/PLAN.md` — "Verification run-journal
  migration": states **the journal and its backends are owned by the spx CLI's local state
  store and its run-journal verbs**, and that the marketplace skills are BLOCKED until spx
  exposes them. This product is that blocker. (It still says `spx audit`/`spx review`; our
  decision supersedes that to one generic `journal` domain — a later plugin-repo PLAN edit.)
- `spx/21-spec-tree.enabler/17-auditing.adr.md` and the `15-verdict-toolchain.enabler` /
  `68-auditing.enabler` state-surface specs — the Python `verdict.py` toolchain (the
  `markdown+json` carrier between `<!-- AUDIT_VERDICT_JSON_BEGIN/END -->`) and the
  `thread_store` are the SUPERSEDED stack, replaced by the spx journal channel.

## The model spx realizes

- **`journal` domain**, type-agnostic. Verbs: `open` / `append` / `read --from <cursor>` /
  `seal` / `render`. Generic CloudEvents payloads; the agent supplies event type/data.
- **Backend bound at the edge by environment.** No CI → `local` backend (`.spx/` files +
  stdout). CI indicating GitHub + pull request → **GitHub-PR backend**: Snapshot
  persistence (Actions artifact/cache) **and** every streamed event also appends a line to
  the PR comment via the `gh` CLI, plus stdout. Explicit override available. Derive from CI
  env vars; do not hard-code a single surface.
- **Run scope** = branch slug (+ PR number under CI) + the opaque type label →
  `.spx/branch/<slug>/<type>/...` locally. spx parameterizes on `<type>`; it does not
  interpret it.
- **Two backends survive as the edge implementations** (see the adapter sequence below):
  the local Appendable backend and the GitHub Snapshot backend.

## Teardown (this restructure removes)

- **`spx/36-audit.enabler`** collapses: `43-audit-config` (auditors/targets),
  `65-auditor-execution` (spx spawning auditors — VOID, spx never spawns agents),
  `76-audit-cli`, `87-audit-status`, the audit run-state/lifecycle CLI — all removed or
  generalized into the `journal` domain. spx stops knowing "audit".
- **`spx/46-reviewing.enabler`** collapses the same way — DEFERRED per "audit first";
  review migrates after the journal domain lands.
- The audit run-state mechanics (event vocabulary, projection fold, terminal seal,
  branch-scope run files) are not audit-specific — they generalize into the `journal`
  domain, parameterized by `<type>`.

## Out of scope for THIS product (plugin-repo, separate SPX sessions — handoff notes)

- Modify the auditing/reviewing **skills** so the agent calls the spx `journal` CLI at each
  significant event (file read, finding, scope, completion). Plugin path:
  `~/Code/outcomeeng/plugins/plugins/src/plugins/spec-tree/skills/`.
- Supersede the plugin `15-verdict-toolchain.enabler` and decide `21-thread-store.enabler`
  fate (plugin PLAN items 1–2).
- Update the plugin `16-verification.enabler/PLAN.md` wording from `spx audit`/`spx review`
  to the generic `journal` domain.
- Reviewing result-delivery governance (plugin PLAN item 6).

## Structural finding: agent-run-journal placement (settle via /decompose)

"agent-run-journal should not be top-level; verification should be" runs into a hard
dependency constraint. The local Appendable backend (`spx/18-state.enabler/71-appendable-journal-store.enabler`)
and the GitHub Snapshot backend (`spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler`)
both **depend on** the agent-run-journal contract (they bind its ports), so the contract
must sit at a LOWER index than they do. The new `34-verification.enabler` channel CONSUMES
those backends, so it sits ABOVE them (index > 21). Therefore the contract cannot nest
under the verification channel without reversing dependency order.

Resolution options (a `/decompose` decision — operator owns index among valid positions):

1. Demote agent-run-journal under `spx/18-state.enabler` (joining its local backend there)
   at an index below `71-appendable-journal-store` — minimal churn, preserves order, but
   couples a cross-cutting contract to the state domain.
2. Move the whole cluster (agent-run-journal + both backends) under `34-verification` —
   dependency-valid (the cluster's external deps `43-record-store` at 18 and `github-ci` at
   21 stay lower), but relocates the Snapshot adapter out of its github-ci home.
3. Leave agent-run-journal top-level as a foundational contract; read "not top-level" as
   "verification is the headline, not the journal."

Until settled, the `34-verification` channel references the contract at its current path
`spx/15-agent-run-journal.enabler`; update the 14 spec references when the move lands.

## Open questions (settle during execution — not pre-decided here)

- Exact env-var names and contract: backend selection, run scope/branch, PR number, and the
  type label. (Prior plugin form: `SPX_VERIFY_BACKEND`, `SPX_VERIFY_BRANCH`.)
- Exact node structure + indices for the new top-level `verification` enabler and the
  `journal` domain under it — via `/decompose`; operator chooses indices.
- How the generic verbs (`open`/`append`/`read --from cursor`/`seal`/`render`) reconcile
  with the now-removed audit `init`/`progress`/`close`/`status` shape.
- thread-store fate and reviewing result-delivery PDR (plugin decisions).

## Progress (resume here)

On branch `work/journal`, committed:

- restructure context in the three affected PLANs;
- `spx/34-verification.enabler/verification.md` + `13-journal-channel.adr.md` (the
  type-agnostic channel decision);
- the agent-run-journal placement constraint (above);
- `spx/34-verification.enabler/21-journal.enabler/journal.md` (the journal CLI domain
  spec; node is in `spx/EXCLUDE`) + `13-journal-module-structure.adr.md`.
- Architecture audit APPROVED on both journal ADRs.

**Landed (implementation):**

- `src/domains/journal/backend-selection.ts` + its mapping test — the pure env→backend
  resolver (`SPX_VERIFY_BACKEND` override; CI+GitHub+PR → `github-pr`; else `local`).
  Tested GREEN, linted, committed. The node stays in `spx/EXCLUDE` until every assertion
  is implemented.
- `src/domains/journal/run-scope.ts` + its property test (`run-scope.property.l1.test.ts`)
  — the pure run-file path composer `journalRunFilePath`, reusing the state-store
  `branchScopeDir` → `runsDir` → `runFileName` helpers to yield
  `.spx/branch/<slug>/<type>/runs/run-<token>.jsonl`, validating the branch slug and the
  opaque `<type>` segment for path safety. Added `branchSlug`/`runToken` arbitraries to
  `testing/generators/state-store/state-store.ts`. Tests + code audit gates APPROVED.
  NOTE: `STATE_STORE_DOMAIN` (src/lib/state-store/index.ts) still enumerates
  `audit`/`review`/`test`/`compact`; under this restructure `<type>` is caller-supplied and
  validated only for path-safety by `domainDir`, so those enum entries generalize away —
  fold this into the teardown.
- `src/domains/journal/run-state.ts` + `run-state.compliance.l1.test.ts` and
  `projection.property.l1.test.ts` — the pure `foldJournalRunState(events, sealed)` over the
  generic `com.outcomeeng.spx.journal.run.{started,progress,completed}` lifecycle vocabulary,
  plus the `JournalRunState` envelope. Per operator decision the envelope is the FULL
  audit+review union: `targetKind` (`branch`/`pull-request`) + optional `pullRequestNumber`,
  `participants` (was auditors/reviewers), `baseRef`/optional `baseSha`/`headSha`,
  `configDigest`, `scope` (PathFilterConfig, was targets), timestamps, `outputPaths` (plural),
  terminal status. Seal+terminal coupling is honored as a pure function of `(events, sealed)`.
  Added `testing/generators/journal/run-state.ts`. Tests + code audit gates APPROVED.
  NOTE: latest-run ordering (`selectLatest…`) and the branch-runs reader types
  (`TerminalRun`/`IncompleteRun`/`BranchRuns`) are NOT in this domain slice — `journal.md`
  declares no ordering/lookup assertion at this node; they belong to the command/status slice
  below alongside the `journal render` list/status assertion that consumes them.

**Remaining journal-domain slices (each: source + co-located test, GREEN, lint, commit):**

1. Command orchestration — `src/commands/journal/`: bind the resolved backend + the
   agent-run-journal contract; implement `open`/`append`/`read --from cursor`/`seal`/
   `render`; generalize `src/commands/audit/{run-state,lifecycle}.ts`. Carry the latest-run
   ordering + branch-runs reader generalization here, where the status/list assertion lives.
2. CLI descriptor — `src/interfaces/cli/journal.ts`, registered in the composition root.
3. GitHub-PR backend streaming — the `gh pr comment` append surface bound under the
   `github-pr` backend (the Snapshot adapter persists; the comment streams).

**Then teardown + ship:** `git rm` the audit domain specs + `src/{domains,commands,
interfaces/cli}/audit*`, unregister `spx audit` from the CLI registry, remove the audit
EXCLUDE/STATE_STORE_DOMAIN entries; `/align`; remove `34-verification.enabler/21-journal.enabler`
from `spx/EXCLUDE` once all assertions pass; `/merge`. Review (`46-reviewing`) follows in a
later pass.

## Execution order

1. `/author` (+ `/decompose`) the spx top-level **`verification`** decision and the
   **`journal`** domain structure, realizing `13-run-journal.adr.md` as spx product truth;
   demote `15-agent-run-journal` under it.
2. `/refactor` — `git rm` the collapsing `36-audit.enabler` (and later `46-reviewing`),
   migrating the generic run-state mechanics into `journal`.
3. `/align` the tree.
4. `/apply` the `journal` domain CLI (verbs + backend selection + streaming).
5. `/merge`.

---

## Adapter sequence (survives — these are the two edge backends)

The event-store interface lives at `src/lib/agent-run-journal/` — the contract in
[`21-event-sourced-journal.adr.md`](21-event-sourced-journal.adr.md), the module
structure in [`32-journal-module-structure.adr.md`](32-journal-module-structure.adr.md).
It names no backend; the two backends the `journal` domain selects between at the edge:

- **Local Appendable adapter** — `spx/18-state.enabler/71-appendable-journal-store.enabler`
  (consumes `43-record-store.enabler`). Maps a journal stream onto the state-store's JSONL
  run mechanics: stream (`streamid`) ↔ one `.spx/` run file; `append(event)` ↔
  `appendJsonlRecord`; `readAll()` ↔ parse every JSONL line into `JournalEvent`s ordered by
  `seq`; `seal()`/`isSealed()` ↔ a seal marker; rejects a duplicate `seq` with
  `JOURNAL_ERROR.SEQ_CONSUMED`.
- **GitHub Snapshot adapter** —
  `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler` —
  Actions artifact / Actions cache / PR comment; binds `SnapshotBackend.write`. Under the
  GitHub-PR backend, a streamed event also appends a PR-comment line via `gh`.
