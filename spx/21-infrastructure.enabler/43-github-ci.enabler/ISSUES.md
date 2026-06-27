# Issues: GitHub CI Integration

## Split dependency review from reusable release verification

`.github/workflows/deterministic-verification.yml` includes a
`dependency-review` job guarded by `if: github.event_name == 'pull_request'`
and declaring `pull-requests: write`. `.github/workflows/publish.yml` calls
that reusable workflow as a tag-push release gate, so GitHub validates the
whole called workflow permission envelope and the caller must grant
`pull-requests: write` even though the tag release path never executes
dependency review.

Impact: the release workflow startup depends on a PR-only permission, widening
the release caller's permission declaration beyond the jobs the tag release path
runs.

Resolution: move dependency review into a dedicated `pull_request`-only
workflow, or split deterministic verification into a reusable release-safe core
and a PR wrapper that adds dependency review. Then remove `pull-requests: write`
from `.github/workflows/publish.yml`.
