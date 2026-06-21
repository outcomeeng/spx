# Issues: Journal

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
