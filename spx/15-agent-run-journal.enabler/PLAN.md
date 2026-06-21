# Plan: Verification restructure — the journal channel

> This PLAN is the durable record of a restructure decided in discussion. It is the
> central context for the audit and review collapse — both domains are now removed
> (`git rm`) and the journal channel has landed, so the per-domain collapse notes that
> once pointed here are gone. Details (exact node structure, indices,
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
- **Verification is the top-level mode** (`34-verification.enabler`). The
  `15-agent-run-journal.enabler` contract stays a foundational top-level node — it is a
  cross-subtree shared substrate, not a verification-only one (see the SETTLED placement
  finding below).

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

- **`spx/36-audit.enabler` — DONE.** The whole audit subtree, `src/{domains,commands,
  interfaces/cli}/audit*`, the audit test generators/harness/fixture, the `auditDomain` CLI
  registration, the audit config descriptor, and the unused `audit`/`review`
  `STATE_STORE_DOMAIN` entries are removed; `spx audit` no longer exists. The generic
  run-state mechanics already live in `spx/34-verification.enabler/21-journal.enabler`.
  References the removal invalidated (the agent-run-journal contract clause, the
  agent-environment descriptor ADR, the snapshot-adapter note) now name the verification
  channel.
- **`spx/46-reviewing.enabler` — DONE.** The whole reviewing subtree is removed and its
  `43-review-state.enabler` `spx/EXCLUDE` entry dropped, now that the journal channel has
  landed. The run-state envelope it specified (target kind, base/head, output paths) was
  already folded into the generic `JournalRunState`; its latest-run lookup, run-file
  filtering, and status-display mapping served `spx review` status commands the type-agnostic
  channel does not provide, so they retire with the domain, and the `pr-{number}` target slug
  is superseded by the envelope's `targetKind`/`pullRequestNumber`.

## Out of scope for THIS product (plugin-repo, separate SPX sessions — handoff notes)

- Modify the auditing/reviewing **skills** so the agent calls the spx `journal` CLI at each
  significant event (file read, finding, scope, completion). Plugin path:
  `~/Code/outcomeeng/plugins/plugins/src/plugins/spec-tree/skills/`.
- Supersede the plugin `15-verdict-toolchain.enabler` and decide `21-thread-store.enabler`
  fate (plugin PLAN items 1–2).
- Update the plugin `16-verification.enabler/PLAN.md` wording from `spx audit`/`spx review`
  to the generic `journal` domain.
- Reviewing result-delivery governance (plugin PLAN item 6).

## Structural finding: agent-run-journal placement (SETTLED via /decompose — option 3)

The agent-run-journal contract stays a foundational top-level node at `spx/15-agent-run-journal.enabler`.
`34-verification.enabler` is the headline mode; "agent-run-journal should not be top-level"
is read as "verification is the headline, not the journal", not as a move of the contract.

Ordering evidence (the deciding analysis): the contract is a cross-subtree **shared
substrate** consumed by three different top-level subtrees —
`spx/18-state.enabler/71-appendable-journal-store.enabler` (binds the `AppendableBackend`
port), `spx/21-infrastructure.enabler/43-github-ci.enabler/21-snapshot-adapter.enabler`
(binds the `SnapshotBackend` port), and `spx/34-verification.enabler` (drives the contract
and consumes both backends). Only a low top-level index lets all three read the contract as
governing context: `15 < 18 < 21 < 34`.

Why the other options were rejected:

- Demoting the contract under `spx/18-state.enabler` (option 1) hides it from the
  infrastructure (21) and verification (34) subtrees — `/contextualize` on a higher-index
  top-level sibling reads `18-state`'s own spec, not its deep descendants, so the snapshot
  adapter and the channel would lose the contract from context.
- Moving the whole cluster (contract + both backends) under `34-verification` (option 2) is
  dependency-valid only by relocating the appendable store out of `state` (it binds
  `43-record-store`) and the snapshot adapter out of `github-ci`, severing their conceptual
  homes for no ordering benefit.

Consequence: the teardown does NOT move agent-run-journal or the backends. The `34-verification`
channel keeps referencing the contract at `spx/15-agent-run-journal.enabler`; no spec-reference
rewrite is needed.

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

- `src/commands/journal/runtime.ts` + `journal-verbs.mapping.l1.test.ts` and
  `streaming.scenario.l1.test.ts` — the `open`/`append`/`read --from cursor`/`seal`/`render`
  verbs binding the LOCAL Appendable backend and the agent-run-journal contract. `append`
  persists and emits to an injected `JournalStreamSink` (the descriptor binds it to stdout,
  keeping the process boundary out of the command layer). Added
  `testing/harnesses/journal/harness.ts` (`createJournalHarness`/`withJournalHarness`/
  `RecordingJournalStreamSink`) and `sampleAgentRunJournalValue`. Tests + code audit gates
  APPROVED. The audit `init`/`progress`/`close`/`status` lifecycle did NOT port — the journal
  verbs layer directly over the contract; the audit lifecycle generalization is unneeded.

- `src/commands/journal/cli.ts` + `journal-cli.scenario.l1.test.ts` and
  `src/interfaces/cli/journal.ts` + `journal-cli-registry.scenario.l1.test.ts` — the CLI
  command surface. The command-layer adapter resolves the product root and branch slug from
  the git environment, binds the backend at the edge (local; github-pr returns an error here),
  and dispatches the verbs; the descriptor owns the process boundary (Commander wiring, stdout
  streaming sink, stdin append-event parsing rejecting malformed JSON through the report/exit
  path, run cursor parsing) and is registered in `src/interfaces/cli/registry.ts`. Added a
  `journal.md` Scenarios assertion for the CLI round-trip. Verified end-to-end through the
  built executable (open→append→read→seal→render; append-after-seal exits 1). Tests + code
  audit gates APPROVED (one code REJECT — unguarded stdin `JSON.parse` — fixed and re-approved).

- `src/commands/journal/github-pr-sink.ts` + `github-pr-sink.scenario.l1.test.ts` — the
  github-pr `JournalStreamSink`: on each emit it re-renders the run's projection and upserts
  the one pull-request comment through the existing Snapshot adapter (`createGithubSnapshotSink`,
  PULL_REQUEST_COMMENT), with the GitHub client injected. Added `arbitraryJournalEvent` to the
  agent-run-journal generator. Tests + code audit gates APPROVED. This is the github-pr STREAMING
  surface; the adapter binds it (next entry).

- `src/commands/journal/cli.ts` (github-pr binding) + `github-cli.scenario.l1.test.ts`,
  `src/commands/journal/github-client.ts` + `github-client.scenario.l1.test.ts`, and the
  descriptor (`src/interfaces/cli/journal.ts`) — the github-pr backend binding. `append`
  resolves its streaming surface by backend kind (the local Appendable backend is the event log
  for every verb in both cases); under github-pr it resolves the PR number from `GITHUB_REF` and
  a run-scoped comment marker, re-renders the run's projection, and upserts the one comment
  through `createGithubPrCommentClient` (a `GithubSnapshotClient` over the `gh` CLI:
  find-by-marker, edit-in-place or create; `execa` injected). A render fault surfaces as an error,
  never an empty comment. Verified end-to-end through the built executable. Tests + code audit
  gates APPROVED (one code REJECT — a swallowed render-failure Result — fixed and re-approved).

**The journal channel is functionally complete.** All `journal.md` `[test]` assertions are GREEN
(backend-selection, run-scope, run-state compliance, projection, journal-verbs, streaming
local+github-pr, CLI round-trip + registry), the `[audit]` NEVER rules are satisfied by the
passing code audits, and `spx journal` works on both the local and github-pr backends. The
audit-domain teardown is DONE and the journal node already left `spx/EXCLUDE` (teardown commit).

**Remaining (each: source + co-located test, GREEN, lint, commit):**

1. **`/merge`** — NOT gated on the plugin-repo skill migration. spx exposes `spx audit` in no
   plugin executable path — no skill, agent, or CI workflow calls it, and the plugin's live
   verification model is thread-store + `verdict.py` — so removing `spx audit` breaks no plugin
   consumer and the journal channel merges and publishes independently. The dependency runs the
   other way: the plugin's migration to the run-journal channel needs `spx journal` PUBLISHED
   first (to adopt it and bump `REQUIRED_SPX_VERSION`). Clean order: merge + publish spx journal,
   THEN migrate the plugin. See the out-of-scope notes.

NOTE (deferred to the command/status slice, not yet built): latest-run ordering
(`selectLatest…`) and the branch-runs reader types — `journal.md` declares no ordering/lookup
assertion, so they land with the `journal render` list/status assertion that consumes them,
if and when that surface is specified.

## Execution order

1. `/author` (+ `/decompose`) the spx top-level **`verification`** decision and the
   **`journal`** domain structure, realizing `13-run-journal.adr.md` as spx product truth;
   demote `15-agent-run-journal` under it.
2. `/refactor` — `git rm` the collapsed `36-audit.enabler` and `46-reviewing.enabler` (both DONE),
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
