# @outcomeeng/spx

Developer CLI for code validation and session management.

## What is spx?

**spx** is a developer CLI that provides code validation and session management for spec-driven projects. It orchestrates linting, type checking, circular dependency detection, and manages work handoffs between agent contexts.

### Key Benefits

- **Unified validation**: Run ESLint, TypeScript, and circular dependency checks through a single command
- **Session management**: Queue, claim, and hand off work between agents
- **Multiple formats**: Text, JSON output for CI and automation
- **Secure publishing**: OIDC Trusted Publishing with Sigstore provenance via GitHub Actions

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
pnpm link --global
```

## Usage

### Code Validation

```bash
# Full validation pipeline (circular deps → ESLint → TypeScript)
spx validation all

# Individual checks
spx validation lint           # ESLint
spx validation lint --fix     # ESLint with auto-fix
spx validation typescript     # TypeScript type checking
spx validation circular       # Circular dependency detection
spx validation knip           # Unused code detection

# Production scope only (excludes tests/scripts)
spx validation all --scope production
```

All validation commands support `--quiet` for CI and `--json` for machine-readable output.

### Session Management

Manage work sessions for agent handoffs and task queuing:

```bash
# Create a handoff session (reads content with frontmatter from stdin)
cat << 'EOF' | spx session handoff
---
priority: high
---
# Implement feature X
EOF

# List all sessions
spx session list

# Claim the highest priority session
spx session pickup --auto

# Release session back to queue
spx session release

# Show session content
spx session show <session-id>

# Delete a session
spx session delete <session-id>
```

Sessions are stored in `.spx/sessions/` with priority-based ordering (high > medium > low) and FIFO within the same priority. Commands output parseable `<PICKUP_ID>`, `<HANDOFF_ID>`, and `<SESSION_FILE>` tags for automation.

See [Session Recipes](docs/how-to/session/common-tasks.md) for detailed usage patterns.

### Spec Management (deprecated)

The `spx spec` and `spx spx` CLI domains are **deprecated**. Spec tree management has moved to the **spec-tree** Claude Code plugin, available at [`outcomeeng/claude/plugins/spec-tree`](https://github.com/outcomeeng/claude). The plugin provides skills for understanding, authoring, decomposing, contextualizing, testing, refactoring, and aligning specification trees.

## Development

### Setup

```bash
git clone https://github.com/outcomeeng/spx.git
cd spx
pnpm install
pnpm run build
pnpm link --global  # Optional: makes 'spx' available in your shell
```

### Build and Test

```bash
pnpm run build          # Build with tsup
pnpm run dev            # Build in watch mode
pnpm test               # Run all tests
pnpm run test:watch     # Run tests in watch mode
pnpm run test:unit      # Unit tests only
pnpm run test:e2e       # End-to-end tests only
pnpm run test:coverage  # Tests with coverage
```

### Validation (Required Before Commits)

```bash
pnpm run validate       # Full pipeline: circular deps → ESLint → TypeScript
pnpm run lint           # ESLint only
pnpm run lint:fix       # ESLint with auto-fix
pnpm run typecheck      # TypeScript only
pnpm run circular       # Circular dependency detection
pnpm run knip           # Unused code detection
```

The `pnpm run` scripts use `node bin/spx.js` internally, so they work without a global link. Once linked, you can also use `spx validation all` etc. directly.

## CI/CD

The project uses GitHub Actions for continuous integration and publishing:

- **CI** (`ci.yml`) — Runs validate, test, and build on Node 22 and 24 for every push to `main` and every pull request. Includes dependency review to block PRs introducing vulnerable dependencies.
- **Publish** (`publish.yml`) — Triggered by `v*` tags. Uses OIDC Trusted Publishing (no stored npm tokens) with Sigstore provenance attestation. Requires manual approval via the `npm-publish` GitHub Environment.
- **Scorecard** (`scorecard.yml`) — Weekly OpenSSF Scorecard assessment, results published to the GitHub Security tab.

### Publishing a Release

1. Bump the version in `package.json`
2. Commit and tag: `git tag vX.Y.Z`
3. Push: `git push origin main && git push origin vX.Y.Z`
4. Approve the deployment in the GitHub Actions `npm-publish` environment
5. The package is published with provenance — verify with `npm audit signatures`

## Technical Stack

- **TypeScript** — Type-safe implementation (ESM)
- **Commander.js** — CLI framework
- **Vitest** — Testing framework
- **tsup** — Build tool (esbuild-based)
- **ESLint 9** — Linting with flat config
- **GitHub Actions** — CI/CD with OIDC Trusted Publishing

## Architecture

```
src/
├── commands/      # CLI command implementations
│   ├── session/     # spx session subcommands
│   └── validation/  # spx validation subcommands
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
