# Plan: Review State

## Purpose

Persist local review observations for status and latest-review lookup.

## Governing Specs

- `spx/46-reviewing.enabler/reviewing.md`
- `spx/46-reviewing.enabler/15-review-directory.adr.md`
- `spx/46-reviewing.enabler/21-review-config.enabler/review-config.md`
- `spx/16-config.enabler/54-canonical-descriptor-digest.enabler/canonical-descriptor-digest.md`
- `spx/15-worktree-resolution.pdr.md`

## Implementation Notes

- Define review state shape before branch and PR commands write it.
- Store review state under `.spx/review/{target-kind}/{target-slug}/runs/{run-directory}` at the Git common-dir product root.
- Include branch and PR target discriminators.
- Use canonical review descriptor digest for staleness.
- Keep incomplete run behavior explicit and visible.

## Evidence Required

- State tests cover successful, rejected, failed, interrupted, incomplete, and parse-invalid review runs.
- Storage tests prove branch and PR targets use separate target-kind directories under `.spx/review/`.
- Latest lookup tests cover branch targets and PR targets.
- Digest tests prove config changes mark review state stale.

## Parallelization

This can proceed after review config and canonical descriptor digest are available.
