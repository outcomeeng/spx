# spx

Fast, deterministic CLI tool for spec workflow management.

> **Note**: This tool will be published to a registry when it reaches a more mature state. For now, install directly from GitHub.

## What is spx?

**spx** is a developer CLI that provides code validation and session management for spec-driven projects. It orchestrates linting, type checking, circular dependency detection, and manages work handoffs between agent contexts.

### Key Benefits

- **Unified validation**: Run ESLint, TypeScript, and circular dependency checks through a single command
- **Session management**: Queue, claim, and hand off work between agents
- **Multiple formats**: Text, JSON output for CI and automation

## Installation

### From GitHub (Latest)

```bash
# Clone and install
git clone https://github.com/simonheimlicher/spx-cli.git
cd spx-cli
pnpm install
pnpm run build
pnpm link --global  # Makes 'spx' available globally
```

### From Registry (Coming Soon)

```bash
# Will be available when published
pnpm add -g spx
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

All commands support `--quiet` for CI and `--json` for machine-readable output.

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

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run validation (required before commits)
pnpm run validate   # or: spx validation all

# Build
pnpm run build

# Run locally
node bin/spx.js --help
```

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
