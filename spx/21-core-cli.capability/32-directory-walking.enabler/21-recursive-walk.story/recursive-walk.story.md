# Story: Recursive Walk

## Functional Requirements

### FR1: Recursively walk directory tree

```gherkin
GIVEN a root directory path
WHEN walking the directory tree
THEN return all subdirectories recursively
```

#### Files created/modified

1. `src/scanner/walk.ts` [new]: Implement `walkDirectory()` function
2. `src/types.ts` [modify]: Add `DirectoryEntry` type

### FR2: Respect filesystem boundaries

```gherkin
GIVEN a directory tree with symlinks
WHEN walking the directory tree
THEN follow symlinks but avoid infinite loops
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Add symlink detection and loop prevention

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component           | Level | Justification                            |
| ------------------- | ----- | ---------------------------------------- |
| Directory traversal | 2     | Requires real filesystem operations      |
| Path normalization  | 1     | Pure function (but uses in Level 2 test) |
| Symlink detection   | 2     | Requires real symlinks                   |

### When to Escalate

This story uses Level 2 because:

- Directory walking fundamentally requires filesystem I/O
- Cannot mock `fs.readdir` reliably without losing real-world behavior
- Need to verify cross-platform path handling (Windows vs Unix)

## Integration Tests (Level 2)

```typescript
// test/integration/scanner/walk.integration.test.ts
import { walkDirectory } from "@/scanner/walk";
import path from "path";
import { describe, expect, it } from "vitest";

describe("walkDirectory", () => {
  /**
   * Level 2: Integration tests with real filesystem
   */

  it("GIVEN directory with subdirectories WHEN walking THEN returns all paths", async () => {
    // Given
    const fixtureRoot = path.join(__dirname, "../../fixtures/simple-tree");

    // When
    const entries = await walkDirectory(fixtureRoot);

    // Then
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.path.startsWith(fixtureRoot))).toBe(true);
  });

  it("GIVEN nested directory structure WHEN walking THEN discovers all levels", async () => {
    // Given
    const fixtureRoot = path.join(__dirname, "../../fixtures/nested-tree");

    // When
    const entries = await walkDirectory(fixtureRoot);

    // Then
    const depths = entries.map((e) => e.path.split(path.sep).length);
    expect(Math.max(...depths)).toBeGreaterThan(3); // Has nested structure
  });

  it("GIVEN empty directory WHEN walking THEN returns empty array", async () => {
    // Given
    const fixtureRoot = path.join(__dirname, "../../fixtures/empty-dir");

    // When
    const entries = await walkDirectory(fixtureRoot);

    // Then
    expect(entries).toEqual([]);
  });

  it("GIVEN non-existent directory WHEN walking THEN throws error", async () => {
    // Given
    const nonExistent = "/path/that/does/not/exist";

    // When/Then
    await expect(walkDirectory(nonExistent)).rejects.toThrow();
  });
});
```

## Quality Requirements

### QR1: Type Safety

**Requirement:** Directory walker must have strict type signatures
**Target:** `walkDirectory(root: string): Promise<DirectoryEntry[]>`
**Validation:** TypeScript enforces types

### QR2: Error Handling

**Requirement:** Filesystem errors must be propagated clearly
**Target:** Throws descriptive errors for permissions, missing dirs
**Validation:** Integration tests verify error messages

### QR3: Performance

**Requirement:** Efficient directory traversal
**Target:** No unnecessary filesystem calls
**Validation:** Integration tests complete quickly (<100ms for small trees)

## Completion Criteria

- [ ] All Level 2 integration tests pass
- [ ] Real filesystem operations work
- [ ] Error handling for edge cases
- [ ] BDD structure (GIVEN/WHEN/THEN) in all tests
- [ ] 100% type coverage

## Documentation

1. JSDoc comments on `walkDirectory` function
2. Type definitions for `DirectoryEntry`
3. Examples showing recursive traversal
