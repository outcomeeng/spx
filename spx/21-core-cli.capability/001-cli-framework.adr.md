# CLI Framework

## Purpose

This decision governs how spx parses CLI arguments, routes subcommands, and validates user input. Every subcommand, option, and flag flows through Commander.js — input validation and routing correctness are system-wide concerns.

## Context

**Business impact:** spx is an agent-facing CLI where malformed input causes cryptic runtime errors instead of actionable feedback. Agents retry on failure, wasting tokens and time. Input validation at the boundary prevents cascading failures.

**Technical constraints:** Commander.js parses argv into typed options but does not validate option values against application-specific constraints. All `--status`, `--format`, and similar bounded-choice options require explicit validation before reaching command handlers. TypeScript's type system is erased at runtime — a `status as SessionStatus` cast trusts user input without verification.

## Decision

Use Commander.js for command routing. Validate all user-supplied option values at the CLI boundary before passing them to command handlers.

## Rationale

Commander.js is the industry-standard Node.js CLI framework. It handles argument parsing, subcommand routing, and help text generation with minimal overhead and no runtime dependencies beyond Node.js.

Input validation at the boundary follows the principle that internal code trusts its inputs — only system boundaries (user input, external APIs) require validation. Command handlers receive validated types, never raw strings. This eliminates an entire class of runtime errors where invalid strings propagate through record lookups, switch statements, and directory path construction.

Alternatives considered:

- **oclif**: Plugin architecture designed for large CLI suites; over-engineering for a focused tool
- **Clack**: Prompt-oriented, not command-routing-oriented; limited for persistent TUI
- **yargs**: Comparable to Commander.js but less ecosystem adoption in TypeScript projects

## Trade-offs accepted

| Trade-off                                    | Mitigation / reasoning                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Commander.js does not validate option values | Explicit validation layer at CLI boundary; property-based tests verify all valid inputs are accepted and all invalid inputs are rejected |
| TypeScript type casts bypass runtime safety  | Validation functions replace casts — `validateStatus(input)` returns `SessionStatus` or throws                                           |

## Invariants

- Every user-supplied option value is validated against its domain before reaching a command handler
- Invalid input produces an error message listing all valid values

## Compliance

### Recognized by

Commander.js `.action()` handlers receive validated types. No `as SessionStatus` or `as Format` casts on user input — validation functions replace casts.

### MUST

- Validate all bounded-choice options (`--status`, `--format`, `--scope`) against their valid value set before invoking command handlers — user input is untrusted ([review])
- Include valid values in error messages for invalid input — agents and users need actionable feedback ([review])
- Use property-based tests (`fast-check`) to verify input validation accepts exactly the valid set and rejects everything else — example-based tests miss edge cases ([review])
- Lazy-load Ink only when interactive mode is invoked — non-interactive commands pay no TUI dependency cost ([review])

### NEVER

- Cast user input with `as T` to satisfy TypeScript — casts are lies that crash at runtime ([review])
- Pass unvalidated strings to record lookups, `join()`, or filesystem operations — undefined propagation causes cryptic errors ([review])
- Import Ink in non-interactive command paths — violates startup time budget ([review])
