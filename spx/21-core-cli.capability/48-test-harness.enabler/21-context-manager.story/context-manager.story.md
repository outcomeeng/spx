# Story: Context Manager

## User Story

AS A test author
I WANT a context manager that handles temp directory lifecycle
SO THAT I don't write boilerplate setup/teardown code

## Acceptance Criteria

### AC1: Bare Temp Directory (Default)

```gherkin
GIVEN no options provided
WHEN withTestEnv(callback) is called
THEN creates a unique directory in os.tmpdir()
AND passes { path: "<absolute-path>" } to callback
AND removes directory after callback returns
```

### AC2: Empty Specs Structure

```gherkin
GIVEN emptySpecs: true option
WHEN withTestEnv({ emptySpecs: true }, callback) is called
THEN creates temp directory with specs/doing/ subdirectory
AND passes { path: "<temp-root>" } to callback
AND removes entire tree after callback completes
```

### AC3: Cleanup on Success

```gherkin
GIVEN callback completes successfully
WHEN withTestEnv() returns
THEN temp directory no longer exists
AND callback return value is returned from withTestEnv()
```

### AC4: Cleanup on Failure

```gherkin
GIVEN callback throws an error
WHEN withTestEnv() catches the error
THEN temp directory is still removed
AND error is re-thrown to caller
```

### AC5: Idempotent Cleanup

```gherkin
GIVEN temp directory was already deleted (e.g., by test)
WHEN cleanup runs
THEN no error is thrown
```

## Technical Design

### Implementation

```typescript
// tests/helpers/with-test-env.ts

import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface TestEnvOptions {
  emptySpecs?: boolean;
}

interface TestEnvContext {
  path: string;
}

export async function withTestEnv<T>(
  fn: (ctx: TestEnvContext) => Promise<T>,
): Promise<T>;

export async function withTestEnv<T>(
  options: TestEnvOptions,
  fn: (ctx: TestEnvContext) => Promise<T>,
): Promise<T>;

export async function withTestEnv<T>(
  optionsOrFn: TestEnvOptions | ((ctx: TestEnvContext) => Promise<T>),
  maybeFn?: (ctx: TestEnvContext) => Promise<T>,
): Promise<T> {
  const [options, fn] = typeof optionsOrFn === "function"
    ? [{}, optionsOrFn]
    : [optionsOrFn, maybeFn!];

  const tempPath = join(tmpdir(), `spx-test-${randomUUID()}`);
  await mkdir(tempPath, { recursive: true });

  try {
    if (options.emptySpecs) {
      await mkdir(join(tempPath, "specs", "doing"), { recursive: true });
    }
    return await fn({ path: tempPath });
  } finally {
    try {
      await rm(tempPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (directory may already be deleted)
    }
  }
}
```

### File Location

`tests/helpers/with-test-env.ts`

## Testing Strategy

### Level: 2 (Integration)

**Justification**: Must verify actual filesystem operations - directory creation, structure, and cleanup.

### Tests

```typescript
// tests/helpers/with-test-env.integration.test.ts

describe("withTestEnv", () => {
  describe("bare temp directory", () => {
    it("GIVEN no options WHEN called THEN creates temp directory", async () => {
      let capturedPath: string | undefined;

      await withTestEnv(async ({ path }) => {
        capturedPath = path;
        expect(path).toContain(tmpdir());
        expect(existsSync(path)).toBe(true);
      });

      // After: directory should be cleaned up
      expect(existsSync(capturedPath!)).toBe(false);
    });

    it("GIVEN callback returns value WHEN called THEN returns that value", async () => {
      const result = await withTestEnv(async () => 42);
      expect(result).toBe(42);
    });
  });

  describe("emptySpecs mode", () => {
    it("GIVEN emptySpecs: true WHEN called THEN creates specs/doing structure", async () => {
      await withTestEnv({ emptySpecs: true }, async ({ path }) => {
        expect(existsSync(join(path, "specs", "doing"))).toBe(true);
      });
    });
  });

  describe("cleanup behavior", () => {
    it("GIVEN callback throws WHEN called THEN still cleans up", async () => {
      let capturedPath: string | undefined;

      await expect(
        withTestEnv(async ({ path }) => {
          capturedPath = path;
          throw new Error("test error");
        }),
      ).rejects.toThrow("test error");

      expect(existsSync(capturedPath!)).toBe(false);
    });

    it("GIVEN directory already deleted WHEN cleanup runs THEN does not throw", async () => {
      await withTestEnv(async ({ path }) => {
        // Delete directory inside callback
        await rm(path, { recursive: true });
      });
      // Should not throw
    });
  });
});
```

## Definition of Done

- [ ] `withTestEnv()` function implemented in `tests/helpers/with-test-env.ts`
- [ ] Both overloads (with and without options) working
- [ ] Bare temp directory mode tested
- [ ] Empty specs mode tested
- [ ] Cleanup on success verified
- [ ] Cleanup on failure verified
- [ ] Idempotent cleanup verified
- [ ] TypeScript types exported
