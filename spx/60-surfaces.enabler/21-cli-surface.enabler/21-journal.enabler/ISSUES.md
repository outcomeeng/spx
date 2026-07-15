# Issues: Journal

## FOLLOW-UP — review-run journal projection emitted duplicate sequence numbers

The changes reviewer run `2026-06-30_14-39-57-855-318491581ca8` reported a sealed approved terminal projection with a journal prefix defect: two scope-advanced events both carried `seq: 2`. The terminal event was present, but duplicate sequence numbers contradict the append-only journal contract from `spx/15-agent-run-journal.enabler/agent-run-journal.md`.

Evidence: the `changes-reviewer` rendered result said, "The rendered prefix contains a sequence-number defect: both scope-advanced events have `seq: 2`."

Resolution: reproduce the duplicate-sequence projection for a changes-reviewer journal run, identify whether the defect is in event appending, projection rendering, or subagent result transport, then add focused journal evidence before changing the implementation.

## FOLLOW-UP — an invalid SPX_VERIFY_BACKEND fails read/seal/render with a backend error

`resolveJournalRunContext` resolves the backend up front for every verb, so a
mistyped `SPX_VERIFY_BACKEND` returns "unknown journal backend: <value>
(registered: local, github-pr)" from `read`, `seal`, and `render` too, even
though only `append` branches on the backend. The error names the backend on
verbs that need no backend selection, which reads as confusing.

This is a minor UX nuance, not a rule violation: the channel ADR invariant
"backend identity is resolved once, from the environment" is satisfied — the
backend is resolved once, from the env — and rejecting a misconfigured
environment consistently across all verbs is defensible fail-fast behavior. The
improvement is to resolve the backend only where it is used (the `append`
streaming path) so `read`/`seal`/`render` tolerate an unused, malformed backend
override; that relocates backend resolution out of the shared
`resolveJournalRunContext`, a deliberate refactor of the command layer rather
than a bounded fix, so it is tracked here.

## FOLLOW-UP — seal does not re-render the projection on the github-pr backend

`sealJournalRun` takes no streaming sink and calls only `journal.seal()`, so it
never re-renders or upserts the pull-request comment. Under the github-pr
backend each `append` re-renders and upserts the full projection, so an
intermediate missed emit is superseded by the next append — but if the *last*
append before seal fails to emit, the PR comment stays missing the terminal
event, because seal does not re-render.

Enhancement: thread a `JournalStreamSink` / `JournalStreamBinding` into
`sealJournalRun` and `journalSealCommand` so the github-pr backend re-renders
and upserts the terminal projection on seal, with a scenario test that appends
through a failing sink, seals through a recording sink, and asserts the sink
received the full event history. Until then the spec and code describe only the
implemented best-effort behavior (a committed append is never failed by a
streaming error), not a seal-time self-heal.

## FOLLOW-UP — full pull_request_target support needs event-payload PR-number resolution

The journal recognizes only the `pull_request` GitHub event as a github-pr
backend trigger, because `resolvePullRequestNumber` reads the PR number from
`GITHUB_REF` (`refs/pull/<n>/...`). Under a `pull_request_target` workflow
`GITHUB_REF` is the base branch ref (`refs/heads/<base>`), so the PR number is
not in `GITHUB_REF` — it lives in the event payload at `GITHUB_EVENT_PATH`
(`.number` / `.pull_request.number`).

Recognizing `pull_request_target` for backend selection without resolving its PR
number deterministically fails every `spx journal append` in that workflow
(backend resolves to github-pr, PR number unresolvable). So `pull_request_target`
is excluded until the PR number can be resolved for it.

Full support: extend the command layer to read the PR number from the event
payload (`GITHUB_EVENT_PATH`) when the event is `pull_request_target`, with an
injected filesystem dependency and a test covering that path. `pull_request_target`
workflows are common for jobs that need write permission to post PR comments —
exactly the journal's github-pr surface — so this is a real enhancement, not a
corner case.

## FOLLOW-UP — github-pr comment upsert re-lists all PR comments on every append

Under the github-pr backend, `upsertPullRequestComment` in
`src/lib/github-snapshot-sink/pull-request-comment-client.ts` lists every comment on the pull request
(`gh api ... --paginate --slurp`) and scans the bodies for the run's marker on
each append. For a run of N events on a pull request with M comments this is
O(N × M) body scans and roughly N × (M / page-size) API calls.

The N factor is intrinsic to the process model: each `spx journal append` is a
separate CLI process, so each one re-discovers the comment from scratch — there
is no in-memory state to carry the comment id across appends. Eliminating the
re-list therefore requires persisting the resolved comment id in the run's local
state and reading it back on the next append, which is a separate, larger change
than the upsert call itself; that is why it is tracked here rather than fixed in
the channel changeset. The cost is acceptable at current scale and, because
streaming is best-effort, surfaces only as latency, never an error; it becomes a
bottleneck if either axis grows (e.g. a long audit run on a busy pull request).

Enhancement: persist the comment id (e.g. alongside the run state or in the
run-scope directory) on first create/find, and have `upsertPullRequestComment`
accept and prefer a known comment id — editing it directly and skipping the
list — falling back to the marker scan only when the id is absent or stale.

## FOLLOW-UP — read-set bounds output but still reads every sealed run event

`readSealedJournalRunSet` applies the requested run and event limits after
`readRunMetadata` has already called `store.readAll()` for every sealed run in
the directory. The command therefore bounds returned JSON correctly, but its
disk I/O still scales with the full sealed-run history for the selected branch
and type scope.

This becomes visible when a caller requests a narrow inspection such as
`--limit 1 --event-limit 1`: the output contains one event from one run, while
the command still reads every event from every sealed run file before slicing.
The bounded-output contract is satisfied, but the inspection cost does not yet
scale with the explicit bounds.

Enhancement: split sealed-run metadata discovery from event loading so the
command can select the most recent bounded run set before reading per-run event
history, and read at most the requested event count for each selected run.

## FOLLOW-UP — audit runs lose terminal state in journal-list projection

`spx journal list --limit 50` reports sealed audit runs as
`terminalState: "missing-state"` even when their event streams contain a
terminal audit verdict. For example, audit run
`2026-07-15_21-09-15-216-bc43afdf8d61` on branch slug
`work-diagnose-output-modes-391a4909` is sealed with six events and is listed as
missing its terminal state, while `spx journal read --type audit --branch-slug
work-diagnose-output-modes-391a4909 --run
2026-07-15_21-09-15-216-bc43afdf8d61 --from 1` returns a
`sh.spx.verify.terminal` event whose `terminalStatus` is `rejected`. The same
list projection reports the sealed approved audit run
`2026-07-15_21-25-31-989-f8bf874036ca` as missing its terminal state.

The list and read surfaces therefore disagree about completed audit runs.
Terminal-state filtering, audit discovery, and automation that consumes list
metadata cannot distinguish approved and rejected audit runs reliably.

Resolution: reproduce the mismatch through the journal node's focused tests and
trace how audit terminal events become list metadata. Revisit before relying on
`journal list --terminal-state`, audit summary projection, or merge automation
that consumes list metadata.
