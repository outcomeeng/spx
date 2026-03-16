# AI Agent Context Guide: spx

## Quick Start for Agents

**Single Entry Point**: This document provides project overview and validation requirements.

---

## 🚨 MIGRATION IN PROGRESS: specs/ → spx/

**We are migrating from the legacy `specs/` framework to the CODE Framework in `spx/`.**

| Directory | System         | Status                                                  |
| --------- | -------------- | ------------------------------------------------------- |
| `spx/`    | CODE Framework | **Primary** - use for all new work                      |
| `specs/`  | Legacy         | **Frozen** - do not modify unless explicitly instructed |

**Key differences:**

| Aspect          | Legacy (`specs/`)                | CODE Framework (`spx/`)       |
| --------------- | -------------------------------- | ----------------------------- |
| Test location   | Graduate to global `tests/`      | Stay in container `tests/`    |
| Status tracking | `DONE.md` in container           | `outcomes.yaml` ledger        |
| Philosophy      | Task-driven (backlog/doing/done) | Outcome-driven, durable specs |

**Migration tracking:** Each migrated container has an `SPX-MIGRATION.md` file documenting reverse-graduation of tests.

**Primary guide for new work:** [`spx/CLAUDE.md`](spx/CLAUDE.md)

---

## BSP Numbers

- BSP stands for Binary Space Partitioning.
- BSP numbers are only sibling-unique. Always use the complete path `capability-NN/feature-NN/story-NN` and `capability-NN/feature-NN/adr-NN` etc. when interacting with the user, creating handoff documents or otherwise referring to artifcats within the `specs/` and `spx/` directories.

---

### Finding Work

**Rule**: Lower BSP number = higher priority. Complete `21-*.feature` before `32-*.feature`.

> **Note:** The `spx spec` and `spx spx` domain commands are not yet implemented. Use skills or manual inspection to find work items.

```bash
# These commands do NOT work yet:
# spx spec status
# spx spec next

# Instead, use skills:
/spx:understanding-spx   # Load context for a work item
/spx:managing-spx        # Find next work item, create specs
```

Full CODE Framework rules: [`spx/CLAUDE.md`](spx/CLAUDE.md)

---

## 🚨 VALIDATION GATE (MANDATORY BEFORE COMMIT)

**NEVER commit without passing validation.** This is *non-negotiable*.

```bash
# Full validation pipeline (circular deps → ESLint → TypeScript)
pnpm run validate

# Quick verification before committing
pnpm run validate && pnpm test
```

### Pre-Commit Checklist

Before committing ANY changes:

- [ ] **`pnpm run validate`** passes (all 3 steps: circular deps, ESLint, TypeScript)
- [ ] **`pnpm test`** shows 0 failed tests
- [ ] **`pnpm run build`** succeeds

### Committing Changes

**ALWAYS use the `core:commit` skill to commit.** Never run raw git commands for commits.

```bash
# Correct: invoke the skill
/core:commit

# Wrong: manual git commands
git add . && git commit -m "..."
```

### Available Validation Commands

All validation runs through `spx validation` subcommands. Use pnpm scripts or call spx directly:

| pnpm Script                    | spx Command                             | Purpose                     |
| ------------------------------ | --------------------------------------- | --------------------------- |
| `pnpm run validate`            | `spx validation all`                    | Full validation pipeline    |
| `pnpm run validate:production` | `spx validation all --scope production` | Production scope only       |
| `pnpm run lint`                | `spx validation lint`                   | ESLint only                 |
| `pnpm run lint:fix`            | `spx validation lint --fix`             | Auto-fix ESLint issues      |
| `pnpm run typecheck`           | `spx validation typescript`             | TypeScript only             |
| `pnpm run circular`            | `spx validation circular`               | Check circular dependencies |
| `pnpm run knip`                | `spx validation knip`                   | Find unused code            |

**Options available on all spx validation subcommands:**

- `--scope <scope>`: Validation scope (`full` or `production`)
- `--files <paths...>`: Specific files/directories to validate
- `--quiet`: Suppress progress output
- `--json`: Output results as JSON

---

## Finding Work Items

> **Note:** The `spx spec` and `spx spx` domain commands are not yet implemented.

**For now, use skills to find and understand work:**

```bash
/spx:managing-spx        # Ask "what's next?" - finds next work item by hierarchy (capability -> feature -> story) and then by BSP order
/spx:understanding-spx   # Load full context for a specific work item
```

**Or inspect the `spx/` directory manually:**

- Lower BSP number = higher priority
- Check `outcomes.yaml` for status (missing = unknown, has entries = check if tests pass)

**For CODE Framework details**: Read [`spx/CLAUDE.md`](spx/CLAUDE.md)

---

## Session Management

Use `spx session` to manage work handoffs between agent contexts.

### Core Workflow

```bash
# Create a handoff session (pipe content with frontmatter from stdin)
cat << 'EOF' | spx session handoff
---
priority: high
---
# Task: Implement feature X
EOF
# Output:
# Created handoff session <HANDOFF_ID>2026-01-15_08-30-00</HANDOFF_ID>
# <SESSION_FILE>/path/to/.spx/sessions/todo/2026-01-15_08-30-00.md</SESSION_FILE>

# List all sessions
spx session list

# Claim highest priority session
spx session pickup --auto
# Output: Claimed session <PICKUP_ID>2026-01-15_08-30-00</PICKUP_ID>

# Release session back to queue (if interrupted)
spx session release
```

### Creating Sessions with Content

Metadata (priority, tags) is specified via YAML frontmatter in the content.
This makes `spx session handoff` deterministic for permission pre-approval.

```bash
# From stdin with frontmatter (recommended for agents)
cat << 'EOF' | spx session handoff
---
priority: high
tags: [feature, api]
---
# Implement User Authentication

## Context
- Using JWT tokens
- Need login/logout endpoints

## Files to modify
- src/auth/login.ts
- src/auth/middleware.ts
EOF

# Quick session (adds default frontmatter: priority: medium)
echo "# My task" | spx session handoff
```

### Session Commands Reference

| Command                    | Description                                       |
| -------------------------- | ------------------------------------------------- |
| `spx session list`         | List sessions by status (doing → todo → archive)  |
| `spx session show <id>`    | Display session content                           |
| `spx session pickup [id]`  | Claim session (use `--auto` for highest priority) |
| `spx session release [id]` | Return session to todo queue                      |
| `spx session handoff`      | Create handoff session (reads content from stdin) |
| `spx session delete <id>`  | Remove session                                    |

### Parseable Output Tags

Commands output XML-style tags for easy parsing by automation tools:

- **`<PICKUP_ID>session-id</PICKUP_ID>`** - Output by `spx session pickup`
- **`<HANDOFF_ID>session-id</HANDOFF_ID>`** - Output by `spx session handoff`
- **`<SESSION_FILE>/absolute/path</SESSION_FILE>`** - Output by `spx session handoff` (for direct file editing)

**Detailed recipes**: [`docs/how-to/session/common-tasks.md`](docs/how-to/session/common-tasks.md)

---

## Project Overview

**spx** is a developer CLI for code validation and session management:

- **Code validation** — ESLint, TypeScript, circular dependency detection, unused code analysis
- **Session management** — work handoffs between agent contexts with priority ordering
- **Multiple output formats** — Text, JSON for CI and automation

## Technical Stack

- **Language**: TypeScript
- **Build**: tsup
- **Testing**: Vitest
- **CLI**: Commander.js

## Development

See the [Development section in README.md](README.md#development) for setup, build, and test commands.

Use `pnpm run` scripts (e.g. `pnpm run validate`, `pnpm test`) for development — they work without a global link. The `spx` command requires `pnpm link --global` after building.

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

### Status Determination

**CODE Framework (`spx/`)** - status via `outcomes.yaml` ledger:

| State     | Condition                          | Required Action                 |
| --------- | ---------------------------------- | ------------------------------- |
| Unknown   | Test Files links don't resolve     | Write tests                     |
| Pending   | Tests exist, not all passing       | Fix code or fix tests           |
| Stale     | Spec or test blob changed          | Re-commit with `spx spx commit` |
| Passing   | All tests pass, blobs unchanged    | None—potential realized         |
| Regressed | Was passing, now fails, blobs same | Investigate and fix             |

**Legacy (`specs/`)** - status via `tests/` directory:

| State       | Condition                           |
| ----------- | ----------------------------------- |
| OPEN        | Missing or empty `tests/` directory |
| IN PROGRESS | `tests/` has files but no `DONE.md` |
| DONE        | `tests/DONE.md` exists              |
