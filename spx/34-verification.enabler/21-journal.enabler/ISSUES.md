# Issues: Journal

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
`src/commands/journal/github-client.ts` lists every comment on the pull request
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
