# @outcomeeng/spx

Developer CLI for code validation and session management.

## What is spx?

**spx** is a developer CLI that provides code validation and session management for spec-driven projects. It orchestrates linting, type checking, circular dependency detection, and manages work handoffs between agent contexts.

### Key Benefits

- **Unified validation**: Run ESLint, TypeScript, and circular dependency checks through a single command
- **Session management**: Queue, claim, and hand off work between agents
- **Multiple formats**: Text, JSON output for CI and automation

All commands are domain-scoped (e.g., `spx validation`, `spx session`) and support `--quiet` and `--json` flags for CI and automation.

## Installation

```bash
pnpm add -g @outcomeeng/spx
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
# Output:
# Created handoff session <HANDOFF_ID>2026-01-15_08-30-00</HANDOFF_ID>
# <SESSION_FILE>/path/to/.spx/sessions/todo/2026-01-15_08-30-00.md</SESSION_FILE>

# Or create empty session and edit the file directly
spx session handoff
# Then edit the <SESSION_FILE> path returned

# List all sessions
spx session list

# Claim the highest priority session
spx session pickup --auto
# Output: Claimed session <PICKUP_ID>2026-01-15_08-30-00</PICKUP_ID>

# Release session back to queue
spx session release

# Show session content
spx session show <session-id>

# Delete a session
spx session delete <session-id>
```

Sessions are stored in `.spx/sessions/` with priority-based ordering (high → medium → low) and FIFO within the same priority. Commands output parseable `<PICKUP_ID>`, `<HANDOFF_ID>`, and `<SESSION_FILE>` tags for automation.

See [Session Recipes](docs/how-to/session/common-tasks.md) for detailed usage patterns.

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

## Technical Stack

- **TypeScript** - Type-safe implementation
- **Commander.js** - CLI framework
- **Vitest** - Testing framework
- **tsup** - Build tool
- **ESLint 9** - Linting with flat config

## Architecture

```
src/
├── commands/      # CLI command implementations
│   ├── validation/  # spx validation subcommands
│   └── session/     # spx session subcommands
├── validation/    # Lint, typecheck, circular dep logic
├── session/       # Session lifecycle and storage
├── config/        # Configuration loading
├── git/           # Git integration utilities
├── scanner/       # Directory walking, pattern matching
├── status/        # Status state machine
├── reporter/      # Output formatting
├── tree/          # Hierarchical tree building
└── lib/           # Shared utilities
```

## License

MIT
