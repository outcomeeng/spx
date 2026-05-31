# Open Issues

## Test-owned constant warning debt

`pnpm run validate` passed on May 12, 2026 and reported 11 warning-level `spx/no-test-owned-domain-constants` findings in this node. These warnings are existing test-quality debt and should be resolved with `spec-tree:testing`, `typescript:testing-typescript`, and `typescript:auditing-typescript-tests`.

Affected files:

- `spx/36-session.enabler/32-session-identity.enabler/tests/session-identity.scenario.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.compliance.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l1.test.ts`
- `spx/36-session.enabler/43-session-store.enabler/tests/session-store.scenario.l2.test.ts`
- `spx/36-session.enabler/65-session-claim.enabler/tests/session-claim.scenario.l2.test.ts`
- `spx/36-session.enabler/tests/session.scenario.l1.test.ts`

Resolution: replace each test-owned semantic constant with source-owned constants, source-owned test-data APIs, or generated domain data, then remove the corresponding warning entry from the validation debt manifest.

## Formatter baseline outside session rollout

`pnpm run format:check` failed on May 20, 2026 after `pnpm run validate` and `pnpm test` passed. The failure is a formatter baseline outside the session frontmatter rollout, not a validation-gate failure.

Observed command:

```bash
pnpm run format:check
```

Reported files outside this rollout included:

- `pnpm-lock.yaml`
- `spx/15-worktree-resolution.pdr.md`
- `spx/16-config.enabler/PLAN.md`
- `spx/46-reviewing.enabler/15-review-directory.adr.md`

Resolution condition: run the repository formatter in a dedicated formatting cleanup, keep the resulting diff isolated from behavior changes, and then remove this entry.

## Session-aware git context crosses the domain boundary

`src/git/root.ts` imports session-domain errors and messages from `src/domains/session/errors.ts` while also carrying session-aware branch detection and worktree path computation. This creates a `git/` infrastructure dependency on `domains/session/` and extends the existing session-domain coupling in the git helper.

Observed in PR review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4496698009.

Impact: session-specific git behavior becomes harder to move or test independently as more session vocabulary enters the infrastructure layer.

Resolution condition: move session-aware git context logic into the session domain layer or a dedicated session-git adapter module, leaving `src/git/root.ts` with generic git product-root primitives.

## Session git context performs serial independent git reads

`detectSessionWorkContext` awaits the product-root and common-git-dir reads sequentially even though neither command depends on the other. This adds avoidable serialized git process latency to every `spx session handoff` invocation.

Observed in PR review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4497421717.

Impact: session handoff pays two independent git round-trips serially before it can write a session file.

Resolution condition: run the independent product-root and common-git-dir commands concurrently and preserve the existing error semantics for each failed command.

## Canonical classifier has no direct l1 test

`parseCanonicalSession` in `src/domains/session/canonical.ts` is exercised only through the archive integration path — the `session-retention` scenario, compliance, and property tests drive it via `archiveCommand`. The classifier's own contract from [`spx/36-session.enabler/40-canonical-classification.adr.md`](40-canonical-classification.adr.md) — "for every session content string, the classifier either returns canonical metadata or throws" — has no direct `l1` test with literal content covering each non-conformance branch (extra key, missing required key, malformed YAML, no frontmatter) and the accept path.

Impact: a regression in one classifier branch surfaces only through the archive consequence, not at the classifier boundary the ADR's testability claim names.

Resolution condition: add a direct `l1` test for `parseCanonicalSession` with literal content per branch, anchored to a classifier-level spec assertion (decide its owning node — retention consumer vs a session-identity-adjacent parsing assertion — through `/spec-tree:authoring`).

## Frontmatter pattern is exported for a cross-module need

`FRONT_MATTER_PATTERN` in `src/domains/session/list.ts` is exported so `src/domains/session/canonical.ts` can reuse the same frontmatter extraction. Both modules sit in the session domain, so there is no layer-boundary violation, but the export widens the `list` module's public surface to serve a sibling rather than expressing a first-class shared primitive.

Impact: the frontmatter-extraction regex is owned by the reader module while a second consumer depends on it, so a change to either module's framing has to account for the other.

Resolution condition: evaluate extracting the frontmatter delimiter and extraction pattern into a shared session parsing-primitives module so neither `list.ts` nor `canonical.ts` carries the pattern as an incidental public export.
