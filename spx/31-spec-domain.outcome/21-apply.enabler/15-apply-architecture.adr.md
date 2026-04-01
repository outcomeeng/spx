# Apply Architecture

## Purpose

Governs how the `spx spec apply` command family is structured — module layout, TOML editing strategy, and test infrastructure.

## Context

**Business impact:** `spx spec apply` translates spec-tree state into project tool configuration. Incorrect edits corrupt `pyproject.toml`, breaking the quality gate for the entire project.

**Technical constraints:** Python's `tomlkit` provides lossless round-trip TOML editing (parse → modify → stringify preserving comments, whitespace, and formatting). TypeScript TOML libraries either strip comments on stringify or expose only formatting/linting APIs without structured document editing.

## Decision

### Module layout

Apply operations live at `src/spec/apply/{operation}/`, mirroring the spec tree structure and grouping by command:

```text
src/spec/apply/
  {operation}/       # One directory per apply operation
    adapters/        # Language-specific adapters
    command.ts       # Command handler with DI
    index.ts         # Barrel re-exports
```

Future operations follow the same pattern at `src/spec/apply/{operation}/`.

### TOML editing

TOML files are edited using a round-trippable library that preserves comments, whitespace, and formatting on write-back. String-based editing is acceptable as a fallback provided it passes the round-trip compliance tests.

### Test infrastructure

A dedicated test harness (`createApplyHarness`) provisions a temp directory with `spx/EXCLUDE` and `pyproject.toml`, enabling Level 2 integration tests that exercise real file I/O. The harness follows the `createSessionHarness` pattern: setup, operate, assert, cleanup.

## Rationale

**Module layout:** `src/spec/apply/exclude/` groups by command (`apply`) under the spec domain, leaving room for future apply operations without polluting the domain root. The alternative (`src/spec/exclude/`) conflates the operation name with the domain.

**TOML editing:** String-based editing preserves formatting but is fragile for non-standard TOML layouts. A round-trippable library handles edge cases (inline tables, multiline strings, dotted keys) that regex cannot. The compliance rule mandates the behavior (preservation), not the mechanism — allowing migration from string-based to library-based without spec changes.

**Test harness:** DI fakes test command logic but not file I/O paths (encoding, permissions, atomicity). The session harness pattern is proven in this codebase and catches real-world failures that pure-function tests miss.

## Trade-offs accepted

| Trade-off                                                | Mitigation                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| WASM dependency adds bundle size if `@taplo/lib` is used | WASM is only loaded when `spx spec apply` runs — not on every CLI invocation                                |
| String-based fallback is fragile for unusual TOML        | Compliance tests verify round-trip preservation; fragility surfaces as test failures, not silent corruption |
| Dedicated harness adds test infrastructure to maintain   | Harness is small (~30 lines) and shared across all apply operations                                         |

## Invariants

- Applying exclusions and then re-applying with the same input produces identical output (idempotency)
- Non-excluded entries and sections outside the edited scope are byte-identical after apply

## Compliance

### MUST

- Place apply operation modules at `src/spec/apply/{operation}/` ([review])
- Preserve comments, whitespace, and formatting in edited TOML files ([test])
- Provide a test harness for Level 2 integration tests that exercises real file I/O ([review])
- Use dependency injection for all file system operations in command handlers ([review])

### NEVER

- Import TOML editing logic directly in CLI wiring — command handlers mediate ([review])
- Modify TOML sections that are not explicitly targeted by the operation ([test])
