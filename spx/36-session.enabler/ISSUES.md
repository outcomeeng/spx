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
- `spx/15-worktree-management.pdr.md`
- `spx/16-config.enabler/PLAN.md`
- `spx/46-reviewing.enabler/15-review-directory.adr.md`

Resolution condition: run the repository formatter in a dedicated formatting cleanup, keep the resulting diff isolated from behavior changes, and then remove this entry.

## Infrastructure layer imports a session-domain config type

`src/git/root.ts` imports `SessionDirectoryConfig` from `@/domains/session/show` to type `resolveSessionConfig`, so the generic git infrastructure module still depends on the session domain. Removing `detectSessionWorkContext` cleared the session-domain error coupling, but this type coupling remains.

Observed in PR review of the session-frontmatter implementation.

Impact: `resolveSessionConfig` cannot move or be tested independently of the session domain, and the infrastructure layer carries session vocabulary.

Resolution condition: relocate `SessionDirectoryConfig` to a shared config module, or resolve the session directory configuration in the command layer, leaving `src/git/root.ts` free of session-domain imports.

## Handoff re-derives git state in two places

`handoffCommand` resolves the same git state twice for one `cwd`: `resolveSessionConfig` calls `detectGitCommonDirProductRoot` (`rev-parse --show-toplevel` + `--git-common-dir`) to locate the sessions directory, and `resolveSessionGitRef` also calls `detectGitCommonDirProductRoot` (the same `--show-toplevel` + `--git-common-dir` reads) to derive the worktree roots for the handoff-base gate.

Observed in PR review of the session-frontmatter implementation.

Impact: every `spx session handoff` issues two redundant git subprocess pairs on a hot path.

Resolution condition: gather the toplevel and common-dir once and share the result between session-directory resolution and the handoff-base gate.
