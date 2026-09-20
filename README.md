# @outcomeeng/spx

Developer CLI for code validation and session management.

Current release: 0.7.1

## What is spx?

`spx` is a command-line interface (CLI) tool that provides code validation and session management for projects that implement the spec-as-source methodology named [Outcome Engineering](https://outcome.engineering). The `spx` CLI works hand-in-hand with the **Claude Code** and **Codex** [plugin marketplace for Outcome Engineering](https://github.com/outcomeeng/plugins).

The `spx` CLI orchestrates linting, type checking, circular dependency detection, markdown validation, literal reuse checks, and work handoffs between agent contexts.

### Key Benefits

- Run the full quality gate through a single `spx validation all` command
- Queue, claim, and hand off work between agents with `spx session`
- Text and JSON output for CI and automation
- OIDC Trusted Publishing with Sigstore provenance via GitHub Actions

Commands are domain-scoped, such as `spx validation` and `spx session`. Run a command with `--help` to see its output options.

## Installation

```bash
npm install -g @outcomeeng/spx
```

### From Source

```bash
git clone https://github.com/outcomeeng/spx.git
cd spx
pnpm install && pnpm run build   # bootstrap of a fresh checkout: installs the hook and builds dist/
pnpm add -g .   # `pnpm link --global` was removed in pnpm 11
# first run on a machine: if `pnpm add -g .` fails with a global-bin-directory error,
# run `pnpm setup`, restart your shell, then re-run `pnpm add -g .`
```

`pnpm install` and `pnpm run build` are the one-time bootstrap of a fresh checkout. A worktree pool's canonical checkout is refreshed afterwards only by `git pull`, whose hook installs and builds.

## Usage

### Code Validation

```bash
# Full validation pipeline
spx validation all

# Individual checks
spx validation lint              # ESLint
spx validation lint --fix        # ESLint with auto-fix
spx validation typescript        # TypeScript type checking (alias: spx validation ts)
spx validation circular          # Circular dependency detection
spx validation knip              # Unused code detection
spx validation markdown          # Markdown link validation (alias: spx validation md)
spx validation literal           # Source/test literal reuse detection

# Scope and targeting
spx validation all --scope production        # Exclude tests/scripts
spx validation all --fix                     # Auto-fix across all checks
spx validation all src/session/              # Validate specific files or directories
```

All validation commands support `--quiet` for CI and `--json` for machine-readable output.

### Verification Runs

Execute a verification type over the spec tree and record the run:

```bash
# Run a verification type across the whole product
spx verification <type> run

# Narrow the run to one or more spec-tree operands
spx verification <type> run <path...>
```

Operands resolve from the product root using the same vocabulary as `spx test`; a product-root operand selects the whole tree. The run is rooted at the worktree, warns when that root lies outside a repository, and reports a verification type without a runner instead of opening a run.

### Session Management

Manage work sessions for agent handoffs and task queuing:

```bash
# Create a handoff session (JSON header at start of stdin, then body bytes verbatim)
printf '%s\n' \
  '{"priority":"high","goal":"Implement change X","next_step":"Run the focused validation","specs":[],"files":[]}' \
  '# Implement change X' \
  '' \
  'Body text — `#`, `---`, and code fences are literal because the body is not parsed.' \
  | spx session handoff

# List all sessions
spx session list

# List todo sessions only
spx session todo

# Claim the highest priority session
spx session pickup --auto

# Release one or more sessions back to the todo queue
spx session release [id...]

# Archive a session after adding a non-empty result field to its frontmatter
spx session archive <session-id>

# Show session content
spx session show <session-id>

# Remove old todo sessions (keeps 5 by default)
spx session prune [--keep <n>] [--dry-run]

# Delete a session
spx session delete <session-id>
```

Sessions are stored in `.spx/sessions/` with priority-based ordering (high > medium > low) and FIFO within the same priority. Commands output parseable `<PICKUP_ID>`, `<HANDOFF_ID>`, and `<SESSION_FILE>` tags for automation.

### Local Change drafts

While you edit and audit a Change draft, keep it local:

```bash
# Retain the complete Markdown document and its metadata
spx change draft create --input stdin < change.md

# List retained drafts
spx change draft list

# When a draft is no longer needed, delete it
spx change draft delete <draft-id>
```

The `create` command returns JSON with `draftId`, an absolute `path`, and a repository-relative `relativePath`. Edit the returned file directly to revise the same draft.

Draft operations work offline. File-scoped verification audits support `auditClass: coordination` and `auditKind: change`. Use the returned relative path to identify the candidate.

Authors use the authoring workflow to publish approved drafts to a remote Change store. The `spx change draft` commands never write to that store.

### Spec Management

The `spx spec` CLI provides deterministic inspection and evidence-projection commands such as `status`, `next`, and `context`. Spec authoring and tree-management workflows live in the **spec-tree** Claude Code plugin, available at [`outcomeeng/plugins`](https://github.com/outcomeeng/plugins). The plugin provides skills for understanding, authoring, decomposing, contextualizing, testing, refactoring, and aligning specification trees.

### Release Preparation

Prepare release artifacts after updating the package version:

```bash
# Generate release notes from product history
spx release notes

# Update configured release documentation for the current package version
spx release docs sync
```

## Development

### Setup

```bash
git clone https://github.com/outcomeeng/spx.git
cd spx
pnpm install   # bootstrap of a fresh checkout: installs dependencies and the hook
pnpm run build # bootstrap: builds dist/
pnpm add -g .  # optional: makes 'spx' available in your shell (`pnpm link --global` was removed in pnpm 11)
# if `pnpm add -g .` fails with a global-bin-directory error, run `pnpm setup`, restart your shell, then re-run it
```

The install and build are the one-time bootstrap of a fresh checkout. A worktree pool's canonical checkout is refreshed afterwards only by `git pull`, whose hook installs and builds.

### Build and Test

```bash
pnpm run build          # Build with tsup
pnpm run dev            # Build in watch mode
pnpm test               # Build, then run all tests
pnpm run test:watch     # Run tests in watch mode
pnpm run test:unit      # Unit tests only
pnpm run test:e2e       # Build, then run end-to-end tests
pnpm run test:coverage  # Tests with coverage
```

### Validation (Required Before Commits)

```bash
pnpm run validate              # Source CLI: full validation pipeline, excluding circular checks
pnpm run validate:production   # Source CLI: production scope only, excluding circular checks
pnpm run lint                  # Source CLI: ESLint only
pnpm run lint:fix              # Source CLI: ESLint with auto-fix
pnpm run typecheck             # Source CLI: TypeScript only
pnpm run circular              # Source CLI: circular dependency detection
pnpm run circular:published    # Packaged executable circular dependency detection
pnpm run knip                  # Source CLI: unused code detection
```

The development validation scripts run `tsx src/cli.ts`, so they validate the current source tree. The packaged executable at `bin/spx.js` requires `dist/cli.js`; run `pnpm run build` before invoking it directly or through a global link.

### Publish Validation

```bash
pnpm run publish:check        # Source validation, circular check, build, tests, packaged validation
pnpm run validate:published   # Packaged executable validation excluding circular checks; requires dist/cli.js
```

`pnpm run publish:check` is the required pre-publish gate. It runs source validation, source circular dependency detection, builds `dist/`, runs the test suite, and then runs packaged validation plus packaged circular dependency detection against the built executable.

### Code Quality (SonarCloud)

SonarCloud analyzes the repository through server-side [automatic analysis](https://docs.sonarsource.com/sonarcloud/advanced-setup/automatic-analysis/) on every push to `main` and every pull request, so there is no analysis step in the GitHub Actions workflows. The `.sonarcloud.properties` file at the repository root is its only required artifact; it pins the Python analysis target for the single Python test fixture so analysis does not warn about defaulting to all Python 3 versions.

`.mcp.json` registers a SonarQube MCP server so agents can query the project's findings — quality gate, issues, coverage, duplication, and dependency risks. It complements the `sonarqube@claude-plugins-official` plugin enabled in `.claude/settings.json`: the plugin supplies SonarQube slash-command skills, and this MCP server gives those skills and any MCP-aware agent access to the project's SonarCloud data. To activate it, install the [`sonar` CLI](https://cli.sonarqube.com) from SonarSource's official instructions onto `PATH`, ensure a container runtime (Docker, Podman, or Nerdctl) is running — `sonar run mcp` starts the server in a container — and authenticate to the `outcomeeng` SonarCloud organization:

```bash
sonar auth login -o outcomeeng   # opens a browser; the token is stored in the OS keychain
```

Until then the MCP server entry is inert: it does not affect builds, tests, or validation.

The local static-analysis gate is `pnpm run validate`, which includes the ESLint mirror of SonarQube findings. SonarQube Cloud automatic analysis still runs server-side on pushes and pull requests.

## CI/CD

The project uses GitHub Actions for continuous integration and publishing:

- `deterministic-verification.yml` — Runs the deterministic verification suite (validation, circular dependencies, tests with the status projection, and packaged-CLI checks) as parallel jobs on Node 24 for every push to `main` and every pull request, skipping root instruction docs. Includes dependency review on pull requests to block PRs introducing vulnerable dependencies.
- `agentic-verification.yml` — Runs agentic verification (audit and review) over each pull request.
- `publish.yml` — Triggered by `v*` tags. Gates on `deterministic-verification.yml` and publishes its verified build via OIDC Trusted Publishing (no stored npm tokens) with Sigstore provenance attestation. Requires manual approval via the `npm-publish` GitHub Environment.
- `scorecard.yml` — Weekly OpenSSF Scorecard assessment, results published to the GitHub Security tab.

### Publishing a Release

A release moves through four phases in order: version bump, preparation and
testing on a branch in an assigned worktree, merge through a pull request
followed by a pull in the canonical main checkout, and operator-authorized
publication. The canonical main checkout keeps `main` checked out and accepts
no operation other than `git pull`; its hook installs locked dependencies and
builds the shared `spx`. Choosing a version or preparing the candidate does not
authorize publication.

**Version bump.** Apply the first matching rule to the complete change since
the previous release: the operator's stated version or bump level; `major`
when the major version is above zero and existing public behavior becomes
incompatible; `minor` for a new command, new capability, or incompatible change
while the major version is zero; otherwise `patch`.

**Prepare and test in the assigned worktree.**

1. On a branch synchronized with `origin/main`, bump the version:
   `pnpm version <level-or-version> --no-git-tag-version`. Never run it in the
   canonical checkout.
2. Generate the release artifacts from this worktree's source:

   ```bash
   tsx src/cli.ts release notes
   tsx src/cli.ts release docs sync
   ```

   Validate the generated changelog section and documentation updates
   structurally and audit their faithfulness before accepting them.
3. Run `pnpm run publish:check` against the complete candidate and report each
   stage: source validation, circular dependencies, build, tests, packaged
   validation, and packaged circular dependencies. Exercise the changed commands
   through this worktree's built `node bin/spx.js` as well.
4. Commit the candidate and complete the applicable independent audits and
   review. A repair changes the candidate and repeats the affected verification.
   Record the verified commit and tree; exactly that content goes to `main`.

**Merge, pull, and check.**

1. Push the branch and merge it through a pull request with current-head CI and
   review. If base movement or conflict resolution changes the candidate,
   verify the result in the assigned worktree before merging.
2. Run `spx diagnose` and require a `compliant` `worktree-pool` verdict; use its
   `mainCheckoutPath`. Before touching the canonical checkout, confirm from the
   assigned worktree that no other session holds it, that it is clean, and that
   after `git fetch origin main` its `HEAD` is an ancestor of `origin/main`, so
   the pull fast-forwards:

   ```bash
   git merge-base --is-ancestor "$(git -C <mainCheckoutPath> rev-parse HEAD)" origin/main
   ```
3. In the canonical checkout run only `git pull`. Its hook builds the shared
   `spx`. Never bump, generate, commit, tag, install, or run an explicit build
   there, and keep `main` checked out.
4. From the assigned worktree, confirm the canonical checkout is clean, sits on
   the merged commit, and matches the verified candidate; that the pull and
   hook succeeded; that `spx --version` reports the prepared version; and that
   the shared executable runs the changed behavior against isolated targets. A
   successful pull or a matching version alone is not enough. On failure,
   repair on an assigned-worktree branch and repeat the pull request, pull, and
   checks; never repair the canonical checkout directly.

**Authorize and publish.** Present the evidence from the phases above and ask
the operator to authorize publication of the exact version and merged commit.
An earlier version choice or release instruction is not that authorization.

1. After authorization, tag the verified merged commit and push the tag from
   the assigned worktree: `git tag vX.Y.Z` then `git push origin vX.Y.Z`. Do not
   push a local `main` or add a release commit after verification.
2. Approve the deployment in the GitHub Actions `npm-publish` environment. The
   tagged workflow runs `spx release publish --tag "${GITHUB_REF_NAME}"` from a
   checkout at the tagged commit, confirms the package identity and provenance,
   then creates or repairs the GitHub Release from the validated changelog
   section.
3. Confirm the registry version, tagged commit, provenance, and hosted release:

   ```bash
   npm view @outcomeeng/spx version
   npm audit signatures
   gh release view vX.Y.Z --json tagName,name,targetCommitish,body,url
   ```

   A matching version string or a green workflow alone establishes none of the
   four. `spx release publish` is resumable for partial-publication recovery.

## Technical Stack

- TypeScript — type-safe implementation (ESM)
- Commander.js — CLI framework
- Vitest — testing framework
- tsup — build tool (esbuild-based)
- ESLint 9 — linting with flat config
- GitHub Actions — CI/CD with OIDC Trusted Publishing

## Architecture

```
src/
├── commands/      # CLI command implementations
│   ├── session/     # spx session subcommands
│   ├── validation/  # spx validation subcommands
│   └── spec/        # spx spec subcommands
├── domains/       # Domain routers
├── validation/    # Lint, typecheck, circular dep logic
├── session/       # Session lifecycle and storage
├── config/        # Configuration loading
├── git/           # Git integration utilities
├── scanner/       # Directory walking, pattern matching
├── status/        # Status state machine
├── reporter/      # Output formatting
├── tree/          # Hierarchical tree building
├── precommit/     # Pre-commit hook orchestration
└── lib/           # Shared utilities
```

## License

MIT
