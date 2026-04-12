# spx

## Why this product exists

AI coding agents waste time and tokens on deterministic file operations — scanning specs, managing sessions, resolving configs, syncing marketplace plugins. spx replaces these with sub-100ms CLI commands, freeing agents and developers to focus on decisions rather than file manipulation.

## Product hypothesis

WE BELIEVE THAT providing a multi-domain CLI (`spx <domain> <command>`) for specs, sessions, validation, and Claude Code configuration
WILL cause agents and developers to adopt CLI-based operations instead of manual file manipulation, reducing tool context-switching by 80%
CONTRIBUTING TO faster iteration cycles and reduced API spend across AI-assisted development workflows

### Evidence of success

| Metric                 | Current                | Target       | Measurement approach             |
| ---------------------- | ---------------------- | ------------ | -------------------------------- |
| Tool context switching | 4-6 tools per workflow | 1 tool (spx) | Count distinct tools per session |
| Command response time  | 1-2 min (LLM-based)    | <100ms       | Benchmark CLI commands           |
| Token cost per query   | ~2000 tokens           | 0            | Measure API token usage          |
| Domain coverage        | 1 domain (specs)       | 5 domains    | Count functional `spx <domain>`  |

## Scope

### What's included

- Code validation — ESLint, TypeScript, circular dependency detection, unused code analysis
- Session management — work handoffs between agent contexts with priority ordering
- Spec tree operations — status, navigation, and spec lifecycle management
- Claude Code configuration — settings consolidation, marketplace management
- Core infrastructure — config resolution, domain routing, output formatting

### What's excluded

| Excluded                      | Rationale                                             |
| ----------------------------- | ----------------------------------------------------- |
| GUI / web interface           | spx is a CLI tool; integrations can add UI            |
| Interactive prompts / wizards | Future enhancement; CLI-first for agent compatibility |
| Third-party plugin API        | Requires stable domain interfaces first               |
| Domain: docs                  | Future domain for documentation generation            |
| Domain: deploy                | Future domain for release management                  |

## Product-level assertions

### Compliance

- ALWAYS: complete any CLI command in <100ms excluding I/O wait — agents depend on deterministic response times ([review])
- ALWAYS: resolve product root via `git rev-parse` with fallback to `$PWD` — consistent behavior across worktrees and subdirectories ([review])
- NEVER: require network access for core operations — offline-first for development environments ([review])
- NEVER: use LLM inference for operations that can be computed deterministically — tokens are for decisions, not file scanning ([review])
