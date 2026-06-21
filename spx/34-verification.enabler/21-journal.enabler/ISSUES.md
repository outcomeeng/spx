# Issues: Journal

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
