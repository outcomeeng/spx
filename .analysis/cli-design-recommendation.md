# CLI Design Recommendation: Scoped Commands

## TL;DR

**Scope everything** under domain namespaces like `gh` does. Keep convenience aliases at the root for the most common operations.

```bash
# Primary interface (canonical)
spx specs status
spx specs next
spx claude init
spx marketplace status

# Convenience aliases (optional, deprecated in v2.0)
spx status    → spx specs status
spx next      → spx specs next
```

## Analysis

### Two Reference Patterns

#### 1. `gh` CLI (GitHub)

```bash
# Everything scoped by domain
gh issue list
gh issue status      # Domain-specific status
gh pr list
gh repo view

# ONE convenience exception at root
gh status            # Meta-command: aggregates across ALL domains
```

**Key insight:** `gh` has BOTH patterns:

- Scoped commands for consistency: `gh issue status`
- Root-level meta-command: `gh status` (shows issues + PRs + notifications)

#### 2. Linear MCP Server

```bash
# MCP tools use domain prefixes
linear_create_issue
linear_list_issues
linear_update_issue
```

**Key insight:** MCP convention is `{domain}_{action}_{resource}` with underscores.

### Current State

```
spx-cli/
├── src/
│   ├── cli.ts                  # Root commands: status, next
│   ├── commands/
│   │   ├── status.ts           # Spec workflow status
│   │   └── next.ts             # Next work item
│   └── ...
```

### Proposed State

```
spx-cli/
├── src/
│   ├── cli.ts                  # Root + domain routers
│   ├── commands/
│   │   ├── specs/              # Spec workflow domain
│   │   │   ├── status.ts
│   │   │   ├── next.ts
│   │   │   ├── tree.ts
│   │   │   └── validate.ts
│   │   ├── claude/             # User-facing plugin mgmt
│   │   │   ├── init.ts
│   │   │   ├── update.ts
│   │   │   └── status.ts
│   │   └── marketplace/        # Developer-facing marketplace
│   │       ├── status.ts
│   │       ├── update.ts
│   │       ├── reset.ts
│   │       └── version.ts
│   └── ...
```

## Three Domains

| Domain        | Audience               | Purpose                               |
| ------------- | ---------------------- | ------------------------------------- |
| `specs`       | All developers         | Manage spec workflow (status, next)   |
| `claude`      | Plugin users           | Install/update outcomeeng marketplace |
| `marketplace` | Marketplace developers | Maintain plugin JSON, versioning      |

## Recommendation: Hybrid Approach (like `gh`)

### Phase 1: Add scoped commands (v0.2.0)

```bash
# New canonical interface
spx specs status
spx specs next
spx specs tree
spx specs validate

spx claude init [--source <url>]
spx claude update
spx claude status

spx marketplace status
spx marketplace update
spx marketplace reset --force
spx marketplace version
```

### Phase 2: Keep aliases for transition (v0.2.0)

```bash
# Backward compatibility (print deprecation warning)
spx status    → spx specs status   (print: "Use 'spx specs status' instead")
spx next      → spx specs next
```

### Phase 3: Add meta-command (v0.3.0)

```bash
# Root-level meta-command (new behavior, aggregates all domains)
spx status    → Show specs status + claude install status + marketplace sync status
```

### Phase 4: Remove aliases (v2.0.0)

```bash
# Only scoped commands remain
spx specs status
spx status       → Meta-command (all domains)
```

## Why This Is The Right Choice

### ✅ Consistency

- Every command belongs to a clear domain
- Predictable structure: `spx <domain> <command>`
- Easy to discover: `spx specs --help`, `spx claude --help`

### ✅ Extensibility

- Adding domains doesn't break the model
- Room for `spx status` to become a meta-command
- Can add `spx config`, `spx doctor`, etc. without conflicts

### ✅ Familiarity

- Developers already know `gh issue`, `gh pr`, `gh repo`
- Transfer learning from `gh` to `spx`

### ✅ MCP-Ready

- MCP tools will be: `spx_specs_status`, `spx_claude_init`, etc.
- Clear mapping from CLI to MCP tools

### ✅ Self-Documenting

- `spx specs status` is clearer than `spx status` when you have multiple domains
- New users immediately understand the scope

### ❌ Only One Downside: More Typing

- `spx specs status` is longer than `spx status`
- **Mitigation:** Aliases for power users (`.bashrc`: `alias spxs='spx specs status'`)

## Migration Path

1. **v0.2.0:** Add scoped commands, keep root aliases with warnings
2. **v0.3.0:** Change root `spx status` to meta-command (aggregates all domains)
3. **v1.0.0:** Document only scoped commands (but aliases still work)
4. **v2.0.0:** Remove aliases, only scoped + meta-commands remain

## Implementation

### Commander.js Pattern

```typescript
const program = new Command();

// Domain: specs
const specsCmd = program
  .command("specs")
  .description("Manage spec workflow");

specsCmd
  .command("status")
  .description("Get project status")
  .option("--format <format>", "Output format")
  .action(statusAction);

specsCmd
  .command("next")
  .description("Find next work item")
  .action(nextAction);

// Domain: claude
const claudeCmd = program
  .command("claude")
  .description("Manage Claude Code plugins");

claudeCmd
  .command("init")
  .description("Install outcomeeng marketplace")
  .option("--source <url>", "Source URL or path")
  .action(claudeInitAction);

// Domain: marketplace
const marketplaceCmd = program
  .command("marketplace")
  .description("Maintain marketplace (developers)");

marketplaceCmd
  .command("status")
  .description("Show sync state")
  .option("--json", "Output as JSON")
  .action(marketplaceStatusAction);

// Convenience aliases (deprecated)
program
  .command("status")
  .description("(deprecated) Use \"spx specs status\" instead")
  .action(() => {
    console.warn("⚠️  Deprecated: Use \"spx specs status\" instead");
    statusAction();
  });
```

## Decision

**Go with scoped commands + convenience aliases.**

This is the most pragmatic choice because:

1. Matches industry best practice (`gh`)
2. Extensible for future domains
3. Smooth migration path
4. Clear mental model

## Sources

- [GitHub CLI (`gh`) documentation](https://cli.github.com/)
- [Linear MCP server](https://linear.app/docs/mcp)
- [MCP Linear server implementations](https://github.com/jerhadf/linear-mcp-server)
