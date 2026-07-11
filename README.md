# @outcomeeng/spx

Developer CLI for code validation and session management.

## What is spx?

`spx` is a command-line interface (CLI) tool that provides code validation and session management for projects that implement the spec-as-source methodology named [Outcome Engineering](https://outcome.engineering). The `spx` CLI works hand-in-hand with the **Claude Code** and **Codex** [plugin marketplace for Outcome Engineering](https://github.com/outcomeeng/plugins).

The `spx` CLI orchestrates linting, type checking, circular dependency detection, markdown validation, literal reuse checks, and work handoffs between agent contexts.

### Key Benefits

- Run the full quality gate through a single `spx validation all` command
- Queue, claim, and hand off work between agents with `spx session`
- Text and JSON output for CI and automation
- OIDC Trusted Publishing with Sigstore provenance via GitHub Actions

All commands are domain-scoped (e.g., `spx validation`, `spx session`) and support `--quiet` and `--json` flags for CI and automation.

## Installation

```bash
npm install -g @outcomeeng/spx
```

### From Source

```bash
git clone https://github.com/outcomeeng/spx.git
cd spx
pnpm install && pnpm run build
pnpm add -g .   # `pnpm link --global` was removed in pnpm 11
# first run on a machine: if `pnpm add -g .` fails with a global-bin-directory error,
# run `pnpm setup`, restart your shell, then re-run `pnpm add -g .`
```

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

### Spec Management (deprecated)

The `spx spec` and `spx spx` CLI domains are **deprecated**. Spec tree management has moved to the **spec-tree** Claude Code plugin, available at [`outcomeeng/plugins`](https://github.com/outcomeeng/plugins). The plugin provides skills for understanding, authoring, decomposing, contextualizing, testing, refactoring, and aligning specification trees.

## Development

### Setup

```bash
git clone https://github.com/outcomeeng/spx.git
cd spx
pnpm install
pnpm run build
pnpm add -g .  # optional: makes 'spx' available in your shell (`pnpm link --global` was removed in pnpm 11)
# if `pnpm add -g .` fails with a global-bin-directory error, run `pnpm setup`, restart your shell, then re-run it
```

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

Run every step in the canonical main checkout. Keep `main` checked out there for
the entire release so Git refuses attempts to check out `main` in a linked
worktree.

1. Confirm `git branch --show-current` reports `main`, then sync it with
   `origin/main`: `git pull --ff-only origin main`
2. Bump the version with `pnpm version patch --no-git-tag-version`, unless the
   release request specifies `minor`, `major`, or an exact version
3. Run `pnpm run publish:check`
4. Commit and tag:
   `git add package.json`
   `git commit -m "build(release): bump version to X.Y.Z"`
   `git tag vX.Y.Z`
5. Push: `git push origin main && git push origin vX.Y.Z`
6. Approve the deployment in the GitHub Actions `npm-publish` environment
7. Confirm the published version and provenance:

```bash
npm view @outcomeeng/spx version
npm audit signatures
```

8. Require current `main` to equal the release tag commit, then rebuild the
   operator-visible CLI and confirm it reports the released version:

```bash
git fetch --tags origin
test "$(git branch --show-current)" = main
test "$(git rev-parse HEAD)" = "$(git rev-parse 'vX.Y.Z^{commit}')"
pnpm run build
spx --version
```

Do not refresh the CLI with `pnpm install`, global `pnpm add -g`, or package
manager update commands during release close-out. The operator-visible binary
comes from the canonical main checkout only while its HEAD equals the release
tag commit. Stop before the build if `main` advanced. The checkout remains on
`main` throughout.

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
│   └── spec/        # spx spec subcommands (deprecated)
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
