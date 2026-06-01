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

## Session handoff performs serial independent git reads

`resolveSessionGitRef` in `src/commands/session/handoff.ts` gathers the handoff-base git facts with several sequential `GitDependencies` reads, and `isRootWorktree` in `src/git/root.ts` awaits `rev-parse --show-toplevel` and `rev-parse --git-common-dir` one after the other even though neither command depends on the other. This adds avoidable serialized git process latency to every `spx session handoff` invocation.

Observed in PR review: https://github.com/outcomeeng/spx/pull/52#issuecomment-4497421717.

Impact: session handoff pays multiple independent git round-trips serially before it can write a session file.

Resolution condition: run the independent git reads concurrently and preserve the existing null/false semantics for each failed command.
