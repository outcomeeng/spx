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

## Bare numeric-prefix references in session-claim.md

`spx/36-session.enabler/65-session-claim.enabler/session-claim.md` lines 25-26 reference the ADR as `per ADR 21-atomic-claiming` (bare numeric prefix plus slug). The Spec Tree convention is full paths from `spx/` in reference text — `per [spx/36-session.enabler/21-atomic-claiming.adr.md](../21-atomic-claiming.adr.md)`.

Observed by `/spec-tree:aligning` during the JSON-prefix input contract rollout.

Impact: text reference is ambiguous (numeric prefixes repeat under different parents); only the link target carries the unambiguous path.

Resolution condition: rewrite both reference lines to full-path form in a separate PR scoped to reference-style cleanup; do not bundle with behavior changes.

## ADR-32 stated path drifts from codebase reality

`spx/36-session.enabler/32-domain-command-split.adr.md` Decision sentence reads "pure domain logic in `src/session/{concern}.ts` and I/O orchestration in `src/commands/session/{concern}.ts`." The codebase places domain logic at `src/domains/session/` (`src/domains/session/create.ts`, `src/domains/session/errors.ts`, `src/domains/session/list.ts`). The ADR's intent (pure logic in the domain layer) is honored; the literal path differs.

Observed by `/typescript:auditing-typescript-architecture` during the JSON-prefix input contract rollout.

Impact: ADR-32 reads as a literal path mandate, but the actual convention is `src/domains/session/`. New contributors reading ADR-32 may place files in `src/session/` and create true drift.

Resolution condition: update ADR-32's Decision, Rationale, and Compliance sections to use `src/domains/session/` (the codebase reality) in a separate PR scoped to ADR-32 wording cleanup; do not bundle with behavior changes.
