# Feature: Test Harness

## Observable Outcome

A unified test environment API that eliminates boilerplate from integration and E2E tests:

- **Zero cleanup code** - Tests never write try/finally or afterEach for temp directories
- **Declarative setup** - Options describe what's needed, context manager handles how
- **Consistent patterns** - All tests use the same `withTestEnv()` function
- **Guaranteed cleanup** - Resources released even when tests fail or throw

This feature provides foundational test infrastructure that subsequent features depend on.

## Architectural Requirements

### Relevant ADRs

1. [**ADR-003: E2E Fixture Generation Strategy**](../003-e2e-fixture-generation.adr.md) - Defines `generateFixtureTree()` and `materializeFixture()` that this feature wraps
2. [**ADR-004: Test Environment Context Manager**](../004-test-environment.adr.md) - Defines the `withTestEnv()` API and rationale

## API Design

### Function Signature

```typescript
// Bare temp directory (default)
async function withTestEnv<T>(
  fn: (ctx: TestEnvContext) => Promise<T>,
): Promise<T>;

// With options
async function withTestEnv<T>(
  options: TestEnvOptions,
  fn: (ctx: TestEnvContext) => Promise<T>,
): Promise<T>;
```

### Options

```typescript
interface TestEnvOptions {
  /** Generate full fixture from config (uses ADR-003 fixture generator) */
  fixture?: FixtureConfig;

  /** Create empty specs/doing structure */
  emptySpecs?: boolean;
}

interface TestEnvContext {
  /** Absolute path to test environment root */
  path: string;
}
```

### Environment Types

| Option             | Creates                  | Use Case                         |
| ------------------ | ------------------------ | -------------------------------- |
| (none)             | Bare temp directory      | Error handling tests (no specs/) |
| `emptySpecs: true` | `{temp}/specs/doing/`    | Empty project tests              |
| `fixture: config`  | Full fixture via ADR-003 | E2E workflow tests               |

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component       | Level | Justification                     |
| --------------- | ----- | --------------------------------- |
| Option parsing  | 1     | Pure logic, no I/O                |
| Context manager | 2     | Filesystem I/O, needs real tmpdir |

### Escalation Rationale

- **1 → 2**: Unit tests verify option parsing; integration tests verify actual filesystem operations and cleanup behavior.

## Stories

| Story | Name                | Level | Description                                                    |
| ----- | ------------------- | ----- | -------------------------------------------------------------- |
| 21    | context-manager     | 2     | Core `withTestEnv()` implementation with bare/emptySpecs modes |
| 32    | fixture-integration | 2     | Integration with ADR-003 fixture generator                     |

### story-21: Context Manager (Level 2)

Implements the core `withTestEnv()` function with:

- Bare temp directory mode (default)
- Empty specs structure mode (`emptySpecs: true`)
- Guaranteed cleanup via try/finally
- Type-safe overloads

**Acceptance Criteria:**

```gherkin
GIVEN no options
WHEN withTestEnv(callback) is called
THEN creates bare temp directory
AND passes { path } to callback
AND removes directory after callback completes

GIVEN emptySpecs: true option
WHEN withTestEnv({ emptySpecs: true }, callback) is called
THEN creates temp directory with specs/doing/ structure
AND passes { path } to callback
AND removes entire tree after callback completes

GIVEN callback throws error
WHEN withTestEnv(callback) executes
THEN cleanup still runs
AND error propagates to caller
```

### story-32: Fixture Integration (Level 2)

Integrates `withTestEnv()` with the ADR-003 fixture generator:

- Accepts `fixture` option with `FixtureConfig`
- Calls `generateFixtureTree()` and `materializeFixture()`
- Cleanup delegates to `MaterializedFixture.cleanup()`

**Acceptance Criteria:**

```gherkin
GIVEN fixture: PRESETS.MINIMAL option
WHEN withTestEnv({ fixture: PRESETS.MINIMAL }, callback) is called
THEN generates fixture tree via generateFixtureTree()
AND materializes via materializeFixture()
AND passes materialized path to callback
AND calls fixture.cleanup() after callback completes
```

## File Locations

```
tests/helpers/
├── with-test-env.ts        # Core context manager (story-21)
├── fixture-generator.ts    # Existing (ADR-003)
└── fixture-writer.ts       # Existing (ADR-003)
```

## Usage Examples

### Before (Current Pattern)

```typescript
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

it("GIVEN directory without specs/", async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), "spx-test-"));
  try {
    const { exitCode } = await execa("node", [CLI_PATH, "status"], {
      cwd: emptyDir,
      reject: false,
    });
    expect(exitCode).toBe(1);
  } finally {
    await rm(emptyDir, { recursive: true });
  }
});
```

### After (With Test Harness)

```typescript
import { withTestEnv } from "@test/helpers/with-test-env";

it("GIVEN directory without specs/", async () => {
  await withTestEnv(async ({ path }) => {
    const { exitCode } = await execa("node", [CLI_PATH, "status"], {
      cwd: path,
      reject: false,
    });
    expect(exitCode).toBe(1);
  });
});
```

## Dependencies

- **Depends on**: ADR-003 fixture generator (`tests/helpers/fixture-generator.ts`, `tests/helpers/fixture-writer.ts`)
- **Depended on by**: feature-87_e2e-workflow (E2E tests will migrate to use `withTestEnv`)

## Completion Criteria

- [ ] `withTestEnv()` implemented with bare and emptySpecs modes
- [ ] Fixture integration working with ADR-003 generators
- [ ] All new E2E tests use `withTestEnv()` instead of manual cleanup
- [ ] Integration tests verify cleanup occurs on success and failure
- [ ] Existing tests in feature-87 migrated to new pattern (optional, recommended)

## Migration Notes

Existing tests using the manual pattern can migrate incrementally:

1. Import `withTestEnv` from `@test/helpers/with-test-env`
2. Remove `mkdtemp`, `rm`, `tmpdir`, `join` imports
3. Replace try/finally block with `await withTestEnv(async ({ path }) => { ... })`
4. Replace `afterEach` cleanup hooks with inline `withTestEnv` calls

Tests using `materializeFixture()` directly can optionally migrate to `withTestEnv({ fixture: config })` for consistency, but the old API remains supported.
