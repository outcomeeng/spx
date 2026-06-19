# Plan: Reviewing domain collapses into the generic `journal` domain (deferred)

> Central restructure context: `spx/15-agent-run-journal.enabler/PLAN.md`. Read it first.
> This migration is DEFERRED — "audit first." Review is migrated after the `journal`
> domain lands. The notes below record the target; do not execute them in the audit-first
> changeset.

## What happens to this domain

`spx/46-reviewing.enabler` is **removed** in the same way `spx/36-audit.enabler` is: spx
does not orchestrate reviewing — agents call spx. There is no `spx review` subcommand and
no review-aware code in spx. Review and audit differ ONLY by which sub-agent runs; both
bind the one type-agnostic `journal` channel, with `review` as the opaque `<type>` label.

Node-by-node disposition (when this migration is taken up):

- `32-hermetic-review-execution.enabler` and `65-pr-review.enabler` / `54-branch-review`
  — **delete from spx.** Spawning/driving reviewers and resolving PR targets is the calling
  skill/agent's concern; spx only journals the run.
- `21-review-config.enabler` (reviewers, target filters) — **delete from spx.**
- `43-review-state.enabler` — its `ReviewRunState` event-journal + projection + PR/branch
  target scope is the **generic** run-state model. Its richer envelope (target kind,
  `baseSha`, output paths) is the up-to-date shape; the audit side lagged it. **Fold the
  union of both into the generic `journal` run-state** (this is the "review is not stale,
  audit is" point — one model, no per-type differences).

## Why (do not re-derive)

See central PLAN and the plugin governing decisions, especially
`spx/21-spec-tree.enabler/16-verification.enabler/13-run-journal.adr.md`. Note plugin PLAN
item 6: reviewing's result-delivery governance (broaden
`spx/15-audit-result-delivery.pdr.md` to both agentic types, or a separate reviewing PDR)
is an open plugin-repo decision.

## Deferred: legacy `[review]` tag migration

The agentic verdict-mode reconcile moves verification tags onto the current contract —
`[audit]` for judgment constraints, `[test]`/evidence type for falsifiable behavior. When
this domain is migrated, settle each `[review]` tag against its actual evidence rather than
rewriting blind. Files still carrying the legacy blanket `[review]` tag:

```bash
git grep -lE '\[review\]' spx/46-reviewing.enabler
```

Snapshot at time of writing: `reviewing.md`, `21-review-config.enabler/review-config.md`,
`32-hermetic-review-execution.enabler/hermetic-review-execution.md`,
`43-review-state.enabler/review-state.md`, `54-branch-review.enabler/branch-review.md`, and
`65-pr-review.enabler/pr-review.md`. Migrate each `[review]` to `[audit]` (judgment
constraint no deterministic test can falsify) or `[test]`/its evidence type (falsifiable
behavior with co-located evidence), per the verification-tag contract in `spx/CLAUDE.md`.
