# AI Agent Context Guide: spx

## Critical Rules

- ⚠️ **NEVER answer ANY question without invoking at least one skill first** - If the question touches testing, specs, code, architecture, or any topic covered by a skill, invoke the relevant skill BEFORE answering. Skills are the authoritative source — not grep results, not existing files, not your training data. See skill table below.
- ⚠️ **NEVER write code without invoking a skill first** - See skill table below
- ⚠️ **NEVER write tests in `tests/`** - Write in `spx/.../tests/` (co-located with specs)
- ⚠️ **NEVER manually navigate `spx/` hierarchy** - Use `/contextualizing spx/path/to/node` skill
- ⚠️ **ALWAYS read CLAUDE.md in subdirectories** - When working with files in `spx/`, or any other directory, read that directory's CLAUDE.md FIRST if it exists
- ⚠️ **Skills are ALWAYS authoritative over existing files** - When a skill template prescribes a structure (e.g., Architectural Constraints table), follow the skill — not patterns found in existing spec files. Existing files may contain non-standard sections added before skills existed. Never infer framework conventions from existing files; always read the skill.
- 🛑 **SKILLS DOMINATE. NOTHING BELOW THEM VOTES.** Skills > PDR/ADR > Spec > Test > Code. If a skill's examples are extensionless, imports are extensionless — even if 100% of the existing codebase has `.js` suffixes. Those files are in violation; they do NOT constitute precedent. Existing code is the LOWEST layer of truth and decides NOTHING about convention. Before citing "the existing codebase does X" as justification for anything, STOP. That sentence is never an answer to "why did you write it this way?" — the only valid answers are "the skill says so", "the ADR says so", "the spec says so", or "I was wrong." Grep is a research tool, never an authority.
- ⚠️ **NEVER maintain backward compatibility** - When rewriting a module, replace it entirely. No legacy aliases, no re-exports of old names, no shims. Update all imports across the codebase to use the new API.
- ⚠️ **NEVER reference specs or decisions from code** - No `ADR-21`, `PDR-13`, or similar in Python comments or docstrings. Specs are the source of truth; code should not duplicate or point to them. The `semgrep` rule enforces this.
- ⚠️ **NEVER edit `package.json` for dependency changes** - Use `pnpm add`/`pnpm remove` — they update package.json, lockfile, and venv atomically
- ⚠️ **NEVER manually delete untracked files or empty directories** - Git doesn't track empty dirs; `.DS_Store` and `__pycache__` are gitignored artifacts. Use `pnpm run clean` to remove them
- ⚠️ **NEVER copy files when moving** - Use `git mv` to move files. This preserves git history. Never `cp` then delete the original.
- ⚠️ **NEVER use agents to create or modify ANY files** - Agents (subagents, background agents) must ONLY be used for read-only research: searching code, reading files, running read-only commands. ALL file creation, editing, and writing MUST happen in the main conversation context. Agents lack context, create unauthorized files, conflict on shared config, and make unasked-for changes.
- ⚠️ **NEVER `readFileSync` source files in tests** — if you want to read source files from tests you have understood absolutely nothing. Tests verify behavior — see `/spec-tree:testing` and `/typescript:testing-typescript` for methodology.
- ⚠️ **NEVER preserve, override, supersede, or refer to stale specs** — if you want to preserve, override, supersede or refer to no longer valid specs in any way, you have not understood durable map from `/understanding`. Specs declare product truth. When the product changes, the spec is rewritten in place. There is no "superseded by" workflow.
- ⚠️ **NEVER use `git checkout --`, `git stash`, or any destructive git operation** — these must be handed off to the user. Multiple agents may be working concurrently; destructive git operations from one agent can destroy another agent's work. If you need to discard changes, ask the user to do it.
- ⚠️ **STOP TRIGGER: about to run `pnpm exec tsc --noEmit`, `npx tsc`, or any bare type-check command** — run `spx validation ts` instead. Bare `tsc` misses project-specific config, paths, and exclusions. This applies to every TypeScript check, not just commit-time.
- ⚠️ **ALWAYS run `spx validation all` after code changes** — before audit, before commit, before claiming "done". `spx validation ts` alone is not the quality gate — it runs 1 of 5 checks. Never report a subset of checks as clean.
- ⚠️ **NEVER mechanically extract typed literal union values to named constants** — `no-restricted-syntax` warnings on `expect(x).toBe("declared")` where `x: NodeState` are false positives. The type annotation IS the documentation; renaming `"declared"` → `STATE_DECLARED` adds zero information. The lint rule targets magic strings whose meaning is obscure; enum-like union members are already self-documenting. Suppress the warning inline or leave it; never rename.
- ⚠️ **ALWAYS research related codebases before offering architectural options** — before presenting A/B/C choices via `AskUserQuestion`, grep/read related codebases (sibling monorepo paths like `~/Code/CraftFinal/root/`, existing `src/spec/apply/`, etc.) for established patterns. If a pattern already exists there, reference it rather than reinventing. "Read the existing code" beats any combination of options you can invent.

- ✅ **ALWAYS `git mv` when moving tracked files** - Never `cp` then `git add`. `git mv` preserves history. Use `git mv -f` when the target exists.
- ✅ **When uncertain, ASK STRUCTURED QUESTIONS. Never guess implementation patterns, test methodology or requirements.**
- ✅ **Use `AskUserQuestion` for structured questions with predefined options.** Do NOT use it for open-ended questions where the user needs to provide free-form context — just ask in plain text instead.
- ✅ **When interviewing the user, use multi-round structured questions where each round constrains the solution space.** Never present a draft and ask yes/no approval. Each question should surface a genuine design decision with distinct options that lead to materially different outcomes. After 3–4 rounds, the solution space is narrow enough to draft confidently.

---

## Spec Management

### Deprecated: `spx spec` and `spx spx` commands

The `spec` and `spx` CLI domains are **deprecated** and will be removed. They are replaced by the **spec-tree** plugin, which provides the same functionality as Claude Code skills.

### Current: spec-tree plugin (skill-only)

The **spec-tree** plugin (`outcomeeng/claude/plugins/spec-tree`) is the active system for managing specification trees. Core skills:

| Skill                        | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `/spec-tree:understanding`   | Load methodology foundation (node types, ordering, assertions) |
| `/spec-tree:contextualizing` | Load context for a specific work item (walks tree to target)   |
| `/spec-tree:authoring`       | Create specs, ADRs, PDRs, enablers, outcomes                   |
| `/spec-tree:decomposing`     | Break nodes into children with proper ordering                 |
| `/spec-tree:testing`         | Manage spec-test lock file lifecycle                           |
| `/spec-tree:refactoring`     | Restructure the spec tree (move, consolidate, extract)         |
| `/spec-tree:aligning`        | Review for gaps, contradictions, and consistency               |

Additional skills ship with the plugin and are invoked by name: `applying`, `committing-changes`, `interviewing`, `auditing-tests`, `auditing-product-decisions`, `handing-off`, `picking-up`, `refocusing`, `bootstrapping`. See `outcomeeng/claude/plugins/spec-tree/skills/` for the full list.

### Legacy: `specs/` directory

The `specs/` directory uses the legacy task-driven system (backlog/doing/done with `DONE.md`). It is **frozen** — do not modify unless explicitly instructed.

---

## Validation Gate (Mandatory Before Commit)

**NEVER commit without passing validation.** This is *non-negotiable*.

```bash
# Full validation pipeline (circular deps → ESLint → TypeScript)
pnpm run validate

# Quick verification before committing
pnpm run validate && pnpm test

# Build (required before push — the global `spx` command runs from dist/)
pnpm run build
```

### Pre-Commit Checklist

Before committing ANY changes:

- [ ] **`pnpm run validate`** passes (all 3 steps: circular deps, ESLint, TypeScript)
- [ ] **`pnpm test`** shows 0 failed tests

### Pre-Push Checklist

Before pushing (enforced by lefthook pre-push hook):

- [ ] **`pnpm run build`** succeeds — the `spx` global link runs `dist/cli.js`, not source
- [ ] **`pnpm run validate`** passes
- [ ] **`pnpm test`** passes

### Committing Changes

**ALWAYS use the `/spec-tree:committing-changes` skill to commit.** Never run raw git commands for commits.

```bash
# Correct: invoke the skill
/spec-tree:committing-changes

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

- **Language**: TypeScript (ESM)
- **Build**: tsup (esbuild-based)
- **Testing**: Vitest
- **CLI**: Commander.js
- **CI/CD**: GitHub Actions with OIDC Trusted Publishing and Sigstore provenance

## Development

See the [Development section in README.md](README.md#development) for setup, build, and test commands.

Use `pnpm run` scripts (e.g. `pnpm run validate`, `pnpm test`) for development — they work without a global link. The `spx` command requires `pnpm link --global` after building.

## Architecture

```
src/
├── commands/      # CLI command implementations
│   ├── claude/      # spx claude subcommands (deprecated)
│   ├── session/     # spx session subcommands
│   ├── spec/        # spx spec subcommands (deprecated)
│   └── validation/  # spx validation subcommands
├── domains/       # Domain routers
│   ├── claude/      # (deprecated)
│   ├── session/
│   ├── spec/        # (deprecated)
│   └── validation/
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
