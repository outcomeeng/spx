# Frontmatter Key Enforcement

## Purpose

This decision governs enforcement for session frontmatter key usage in TypeScript source and tests.

## Context

**Business impact:** Session frontmatter drives handoff selection, worktree routing, pickup context, and archive readability. A duplicated string key can silently drift from the canonical session schema and make agents miss the work to resume.

**Technical constraints:** The canonical key registry is `SESSION_FRONT_MATTER`. ESLint runs custom project rules during `spx validation all`, and custom rule tests exercise rule modules against source-shaped TypeScript fixtures.

## Decision

Session frontmatter key usage is enforced by a custom ESLint rule that reports string-literal frontmatter keys outside the `SESSION_FRONT_MATTER` definition module.

## Rationale

The frontmatter schema is a closed vocabulary with one runtime source of truth. ESLint catches key duplication at edit time and participates in the same validation path as the rest of the TypeScript quality gate.

A grep-based compliance test was rejected because it reports only during test execution, cannot reason about AST context, and is harder to exempt for the registry definition itself. A shared test helper was rejected because it would reduce duplication in tests without preventing production call sites from drifting.

## Trade-offs accepted

| Trade-off                                                    | Mitigation / reasoning                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| The rule must distinguish key literals from ordinary strings | AST context limits reports to string literal values whose text equals a registered frontmatter key            |
| The registry definition module needs an exemption            | The rule allows the file that defines `SESSION_FRONT_MATTER`; all other modules consume the exported registry |

## Compliance

### Recognized by

The ESLint plugin exports a rule that reports any string literal matching a `SESSION_FRONT_MATTER` value outside the registry definition module.

### MUST

- Every session frontmatter key read or write outside the registry definition module references `SESSION_FRONT_MATTER` — this keeps schema usage tied to the canonical runtime registry ([review])
- The custom ESLint rule is covered by fixtures that include both a violating call site and the allowed registry definition module — this proves the rule reports drift without flagging the source of truth ([review])

### NEVER

- A module outside the registry definition module spells a session frontmatter key as a raw string literal — duplicated keys can drift from `spx/36-session.enabler/11-session-frontmatter.pdr.md` ([review])
- Compliance for frontmatter key usage relies on grep or raw text scanning — textual search cannot model TypeScript syntax or the registry-definition exemption ([review])
