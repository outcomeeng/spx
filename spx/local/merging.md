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

Default: `gh pr merge <pr-number> --merge --delete-branch=false`, followed by the worktree-safe cleanup sequence in `merge-cleanup.md`, which detaches the assigned worktree onto the refreshed `main` tip and then deletes the merged branch on origin and locally. Stacked pull requests merge in dependency order.

Rationale: a merge commit keeps every branch commit reachable, so the merged tip is a true ancestor of `main` and branch deletion needs only the ancestry proof. Rebase and squash rewrite commit identities and reach deletion only through the patch-equivalence fallback, so neither is opted in. `main` carries no branch protection that would require a linear history. The PR branch itself is still rebased onto `origin/main` before every push through `/sync-base` and published with `--force-with-lease`; the merge flag decides only how the reviewed head joins `main`.

## Preview

None. `PREVIEW` is a no-op.

## Deploy

After the verified candidate merges through origin, refresh the shared local CLI as described below. `DEPLOYMENT_READINESS` requires the merged candidate and permission to use the canonical checkout without interfering with another session. The only operation performed in that checkout is `git pull`; its hook builds `spx`.

## Release

Local preparation, merge, shared-CLI verification, and package publication are separate phases. Complete them in that order. Choosing a version or authorizing preparation does not authorize publication.

### Version bump

Apply the first matching rule to the complete change since the previous release:

1. Operator specifies a version or bump → use it.
2. Major version > 0 and existing public behavior becomes incompatible → **major**.
3. New command, new capability, or incompatible change while major is zero → **minor**.
4. Otherwise → **patch**.

### Prepare and test in the assigned worktree

1. Work on a local branch in the assigned worktree, synchronized through `/sync-base`. Prepare the complete candidate intended for `main`, including the version bump and generated release artifacts. Run `pnpm version <level-or-version> --no-git-tag-version` here, never in the canonical checkout.
2. Run the assigned worktree's release commands through `tsx src/cli.ts release notes` and `tsx src/cli.ts release docs sync`. Require structural validation and independent faithfulness audits of the generated changelog and configured documentation before accepting those artifacts.
3. Run `pnpm run publish:check` in the assigned worktree against the complete candidate. Check source validation, circular dependencies, build, tests, packaged validation, and packaged circular dependencies. Report each stage's result and any warnings. Exercise the changed commands through this worktree's built `node bin/spx.js` as well as their applicable automated verification.
4. Commit the candidate through `/commit-changes` and complete the applicable independent audits and review. Any repair changes the candidate and requires the affected verification again. Record the verified commit and tree identities; the content sent to `main` must be exactly this verified content.

### Merge, pull, and check

1. Push the branch to origin and complete the PR workflow through `/merge`, including current-head CI and review. All release-preparation changes reach `main` through that PR. If base movement or conflict resolution changes the candidate's content, verify the resulting candidate in the assigned worktree before merging it.
2. Use `/diagnose` to obtain SPX's `worktree-pool` verdict and `mainCheckoutPath`; require `compliant`. Consume SPX's result without reimplementing its Git-layout rules. Check occupancy, cleanliness, and fast-forward standing before the pull, from the assigned worktree: another session's claim or uncommitted work blocks mutation until ownership is resolved, and after `git fetch origin main` the canonical checkout's `HEAD` must be an ancestor of `origin/main` (`git merge-base --is-ancestor "$(git -C <mainCheckoutPath> rev-parse HEAD)" origin/main`), so the pull fast-forwards and neither merges nor rebases there.
3. In the canonical checkout, run only `git pull`. Its hook builds the shared `spx`. Never prepare artifacts, bump versions, commit, tag, install packages, or run an explicit build there. Keep `main` checked out.
4. From the assigned worktree, verify that the canonical checkout is clean and on the expected merged commit, and that its tree matches the locally verified candidate. Confirm the pull and build hook succeeded, `spx --version` reports the prepared version, and the shared executable exposes and correctly executes the changed behavior using isolated verification targets. Check every applicable result; a successful pull or matching version alone is insufficient. On failure or unexpected content, repair and verify on an assigned-worktree branch, then repeat the PR, pull, and verification sequence. Never repair the canonical checkout directly.

### Authorize and publish

**Predicate (`RELEASE_READINESS`).** Only after local candidate verification, PR merge, canonical pull and hook build, and shared-CLI verification have passed, present their evidence and ask the operator to authorize publication of the exact version and merged commit. An earlier version choice or release instruction does not satisfy this final authorization. Until it is given, emit `AWAIT_RELEASE_AUTHORIZATION`, preserve the candidate and verification identities, and stop before creating or pushing a release tag.

1. After authorization, create `vX.Y.Z` at the verified merged commit and push that tag from the assigned worktree. Do not push a local `main` branch or create a new release commit after verification. If the candidate changes, repeat verification and obtain authorization for the new candidate.
2. Ask the operator to approve the tag run's `npm-publish` deployment; never approve it on the operator's behalf. GitHub Actions verifies the tagged candidate and runs `spx release publish --tag "${GITHUB_REF_NAME}"` from a checkout whose `HEAD` equals the tagged commit. Publication confirms the exact package identity and provenance before reconciling the GitHub Release from the validated committed changelog section.
3. Confirm the exact registry version, tagged commit identity, provenance, and GitHub Release content. A matching version string or successful workflow alone does not establish all four. Use the resumable `spx release publish` contract for partial-publication recovery; never duplicate its registry or hosted-release logic in the overlay.

**Closeout.** Preserve the release-source worktree state for the Handoff `/release-change` writes: the branch in its `Branch or PR` line, and the path, full HEAD SHA, clean or dirty state, and sync status as `Hazards` entries, each with the read-only command that re-confirms it. Preserve also the prepared version, locally verified commit and tree, PR and merged commit, canonical checkout path and pulled commit, hook-build and shared-CLI verification results, operator publication authorization, tag, registry provenance, and GitHub Release.
