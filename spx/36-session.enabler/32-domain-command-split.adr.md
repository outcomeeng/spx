# Domain–Command Split

## Purpose

This decision governs how session domain logic is separated from CLI command handlers. Each session operation has two responsibilities: pure computation (path building, selection, formatting) and I/O execution (filesystem reads, writes, renames). This ADR determines where each responsibility lives.

## Context

**Business impact:** Dead code and inline duplication increase maintenance cost and create coverage gaps. Pure domain modules that no command handler imports are dead code tested only by legacy tests. Command handlers that reimplement pure logic inline create divergence risk.

**Technical constraints:** The session domain has two source directories: `src/session/` (pure functions) and `src/commands/session/` (CLI handlers with I/O). Pure computation (path construction, selection algorithms, formatting) and I/O (readdir, readFile, rename, unlink) have different testability profiles: pure functions are Level 1 testable in isolation, while I/O requires filesystem setup. Command handlers that duplicate pure logic inline force all testing through the I/O layer and leave the pure module untested or tested redundantly.

## Decision

Every session operation follows a two-module split: pure domain logic in `src/session/{concern}.ts` and I/O orchestration in `src/commands/session/{concern}.ts`. The command handler imports from the domain module — never the reverse, never inline duplication.

## Rationale

Pure modules enable Level 1 testing of selection, formatting, and path logic without filesystem setup. Command handlers compose pure functions with I/O operations. When both modules exist but the handler reimplements the pure logic inline, the pure module becomes dead code and the duplication creates divergence risk.

Alternatives rejected:

- **Single file per command (handler + logic)**: Mixes pure and I/O concerns, prevents isolated testing of computation
- **Delete pure modules, keep inline logic**: Loses testability — inline logic in command handlers requires integration test setup for what should be unit-testable computation

## Trade-offs accepted

| Trade-off                            | Mitigation / reasoning                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Two files per concern instead of one | Clear separation enables Level 1 testing of pure logic; command handlers are thin I/O orchestrators |
| Import discipline required           | ESLint `no-restricted-imports` can enforce direction (commands → session, never reverse)            |

## Compliance

### Recognized by

Command handlers in `src/commands/session/` import computation functions from `src/session/`. No `src/session/` module imports from `src/commands/session/`.

### MUST

- Command handlers import pure selection, formatting, and path-building functions from `src/session/` — enables Level 1 testing of computation ([review])
- Pure domain modules in `src/session/` accept all external state as parameters — no direct filesystem or process access ([review])
- Command handlers are the sole site of I/O operations (readdir, readFile, writeFile, rename, unlink, mkdir) — keeps domain modules pure ([review])

### NEVER

- Inline reimplementation of logic that exists in `src/session/` — creates divergence and dead code ([review])
- Import from `src/commands/session/` into `src/session/` — violates dependency direction ([review])
