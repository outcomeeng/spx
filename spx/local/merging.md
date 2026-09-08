# SPX Merge Lifecycle — Repo-Local Overlay

This file specializes `/merge`, `/merging-standards`, `/open-pr`, and `/manage-pr` for this repository. Read it after `merge-policy.md`. It declares lifecycle configuration only; product truth lives in `spx/`.

## Transport

No `transport:` selector. The default precedence applies: a coordination-note-only changeset (`PLAN.md`, `ISSUES.md`) pushes directly to `main`; every other changeset opens a GitHub pull request against `main`.

## Pre-mutation confirmation

None. The lifecycle drives a determined changeset from branch to merge without a confirmation pause.

## Preflight and post-cleanup checks

None beyond the occupancy preflight `/merging-standards` already requires.

## Local deterministic verification

Scope to the touched evidence:

- Validation: `pnpm run validate`. For a Markdown-only changeset, `tsx src/cli.ts validation markdown <paths>` suffices.
- Testing: `spx test --changed --base origin/main`, or `tsx src/cli.ts test --changed --base origin/main` when the branch changes `spx test` itself. Run `pnpm run build` first whenever the changed scope reaches an L2 CLI scenario, because those shell out to `node bin/spx.js` → `dist/cli.js`.
- Escalation to `pnpm run validate` plus `pnpm test`: validation infrastructure, test runner wiring, generated distribution, `package.json` or `pnpm-lock.yaml`, shared runtime code, or a refactor whose touched-scope commands cannot cover the contract.
- Circular dependency detection and full status projection belong to CI (`.github/workflows/deterministic-verification.yml`). No terminal full deterministic gate runs locally.

Lane mapping for a `/sync-base` `preservation.base_delta_paths` set after a rebase:

| Base delta paths                                                                        | Lane                                         |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| Only Markdown outside `spx/**/tests/`                                                   | `tsx src/cli.ts validation markdown <paths>` |
| Any path under `src/`, `testing/`, or `spx/**/tests/`                                   | `pnpm run validate` and the testing lane     |
| `package.json`, `pnpm-lock.yaml`, `tsup.config.*`, `vitest.config.*`, `eslint.config.*` | Escalation lane                              |
| Any other path                                                                          | Escalation lane                              |

Governance surfaces the reviewer judges against, so a base delta touching one re-establishes the local review: `CLAUDE.md`, `AGENTS.md`, every file under `spx/local/`, and every spec, ADR, or PDR under `spx/`.

## Review findings

- Mention-reviewer trigger phrase: `@spec-tree` (the default).
- The `spec-tree-review` bot at times cites a comment-style rule ("Default to writing no comments", "never write multi-line comment blocks", "one short line max") as `CLAUDE.md` or `AGENTS.md`. Neither file carries such a rule, so the citation is unbacked and the finding is dropped. Multi-line comments that capture a non-obvious WHY are permitted here.
- A finding that exposes weak test evidence is fixed by rearchitecting the evidence through `/test-typescript` before merge.

## Merge command

Default: `gh pr merge <pr-number> --merge --delete-branch=false`, followed by the worktree-safe cleanup sequence in `merge-cleanup.md`. Stacked pull requests merge in dependency order.

## Preview

None. `PREVIEW` is a no-op.

## Deploy

None. `DEPLOY` is a no-op.

## Release

Every changeset that reaches `main` is release-eligible. Until a release runs, the merged behavior reaches neither package consumers nor the operator-visible `spx` on `PATH`, which builds from the canonical main checkout.

**Predicate (`RELEASE_READINESS`).** The operator has authorized the release in the current turn, naming `patch`, `minor`, `major`, or an exact version; a bare authorization means `patch`. Without that authorization the transport emits `AWAIT_RELEASE_AUTHORIZATION`, preserves the branch-state closeout record, and stops before any release step. The `npm-publish` environment approval on the tag's workflow run is the operator's second, GitHub-side authorization; the action pauses there and never approves it on the operator's behalf.

**Action.** Run every step in the canonical main checkout defined by `spx/15-worktree-management.pdr.md`: the checkout `git worktree list` reports on `[main]`. That checkout permanently keeps `main` checked out. Never detach it, switch it away from `main`, or move `main` to another worktree; stop the release if it cannot remain on `main`. The release authorization covers that checkout for the release's duration.

1. Confirm `git branch --show-current` reports `main`, sync it to `origin/main` through `/sync-base`, and run `pnpm version <level> --no-git-tag-version`. This updates `package.json` only.
2. Generate the release artifacts from the release data with `spx release notes` and `spx release docs sync`, then review the generated changelog section and documentation updates. The tagged publication reads the changelog section for the released version from the tagged commit and fails when it is absent.
3. Run `pnpm run publish:check`. Report every stage it ran: source validation, circular dependency validation, build, tests, packaged validation, and packaged circular dependency validation. Warning-level lint output with exit 0 is reported by count and does not block.
4. Commit `package.json`, `CHANGELOG.md`, and the configured documentation paths as `build(release): bump version to X.Y.Z` on `main` through `/commit-changes`.
5. Tag with `git tag vX.Y.Z`.
6. Push both refs with `git push origin main && git push origin vX.Y.Z`. The `main` push is fast-forward only; never `--force`.
7. Pause and ask the operator to approve the `vX.Y.Z` run's `npm-publish` deployment. The tagged workflow runs `spx release publish --tag "${GITHUB_REF_NAME}"`, which verifies the tag against the package version, confirms or publishes the provenance-bearing package, and creates or repairs the GitHub Release from the validated changelog section.
8. After approval, confirm the registry with `npm view @outcomeeng/spx version`, provenance with `npm audit signatures`, and the hosted release with `gh release view vX.Y.Z --json tagName,name,targetCommitish,body,url`.
9. Refresh the operator-visible CLI in the canonical main checkout: `git fetch --tags origin`, confirm `git branch --show-current` still reports `main`, and require `git rev-parse HEAD`, `git rev-parse origin/main`, and `git rev-parse "vX.Y.Z^{commit}"` to return the same commit. Then `pnpm run build` and confirm `spx --version` reports `X.Y.Z`. If either ref advanced past the tag, report the three commit identities, leave the CLI unchanged, and complete the refresh through a later release from newly synced `main`; never move `main` backward.

Never refresh the CLI with `pnpm install`, global `pnpm add -g`, or a package-manager update during release close-out.

**Authorities.** `README.md` "Publishing a Release" is the human form of the same sequence; `.github/workflows/publish.yml` runs `spx release publish` on a `v*` tag under the `npm-publish` environment with OIDC Trusted Publishing and Sigstore provenance.

**Closeout.** Preserve the release-source worktree state for `/handoff`'s branch-state record: path, branch, full HEAD SHA, clean or dirty, and sync status.
