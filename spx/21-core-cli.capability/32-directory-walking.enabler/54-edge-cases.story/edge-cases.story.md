# Story: Edge Cases

## Functional Requirements

### FR1: Handle filesystem permission errors

```gherkin
GIVEN a directory with restricted permissions
WHEN walking the tree
THEN throw descriptive error without crashing
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Add permission error handling

### FR2: Handle symlinks without infinite loops

```gherkin
GIVEN a directory tree with circular symlinks
WHEN walking the tree
THEN detect cycles and skip to avoid infinite loops
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Add symlink cycle detection

### FR3: Handle cross-platform path separators

```gherkin
GIVEN paths on Windows vs Unix systems
WHEN processing paths
THEN normalize path separators consistently
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Use `path.sep` and normalization

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component          | Level | Justification                        |
| ------------------ | ----- | ------------------------------------ |
| Permission errors  | 2     | Requires real filesystem permissions |
| Symlink detection  | 2     | Requires real symlinks               |
| Path normalization | 1     | Pure function                        |

### When to Escalate

This story uses Level 2 for filesystem-specific edge cases:

- Permission errors require real restricted directories
- Symlink cycles require real filesystem symlinks
- Path normalization can be tested at Level 1

## Integration Tests (Level 2)

```typescript
// test/integration/scanner/walk.integration.test.ts (continued)
import { walkSpecs } from "@/scanner/walk";
import fs from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";

describe("walkSpecs - Edge Cases", () => {
  /**
   * Level 2: Integration tests with real filesystem edge cases
   */

  it("GIVEN directory with permission error WHEN walking THEN throws descriptive error", async () => {
    // Given
    const restrictedDir = path.join(__dirname, "../../fixtures/restricted");

    // When/Then
    await expect(walkSpecs(restrictedDir)).rejects.toThrow(
      /permission|EACCES/i,
    );
  });

  it("GIVEN directory with circular symlink WHEN walking THEN avoids infinite loop", async () => {
    // Given
    const symlinkDir = path.join(__dirname, "../../fixtures/circular-symlinks");

    // When: Should complete without hanging
    const startTime = Date.now();
    const workItems = await walkSpecs(symlinkDir);
    const elapsed = Date.now() - startTime;

    // Then: Completes quickly (no infinite loop)
    expect(elapsed).toBeLessThan(1000);
    expect(workItems).toBeDefined();
  });

  it("GIVEN very deep directory structure WHEN walking THEN handles depth correctly", async () => {
    // Given: Deep nesting (capability > feature > story)
    const deepDir = path.join(__dirname, "../../fixtures/deep-nesting");

    // When
    const workItems = await walkSpecs(deepDir);

    // Then: Finds all levels
    expect(workItems.some((w) => w.kind === "capability")).toBe(true);
    expect(workItems.some((w) => w.kind === "feature")).toBe(true);
    expect(workItems.some((w) => w.kind === "story")).toBe(true);
  });
});
```

## Unit Tests (Level 1)

```typescript
// test/unit/scanner/walk.test.ts (continued)
import { normalizePath } from "@/scanner/walk";
import { describe, expect, it } from "vitest";

describe("Path normalization", () => {
  it("GIVEN Windows path WHEN normalizing THEN uses forward slashes", () => {
    // Given
    const windowsPath = "C:\\Users\\test\\specs\\capability-21_test";

    // When
    const normalized = normalizePath(windowsPath);

    // Then
    expect(normalized).toContain("/");
    expect(normalized).not.toContain("\\");
  });

  it("GIVEN Unix path WHEN normalizing THEN preserves forward slashes", () => {
    // Given
    const unixPath = "/home/user/specs/capability-21_test";

    // When
    const normalized = normalizePath(unixPath);

    // Then
    expect(normalized).toBe(unixPath);
  });
});
```

## Quality Requirements

### QR1: Graceful Error Handling

**Requirement:** Filesystem errors don't crash the process
**Target:** Descriptive errors with context
**Validation:** Integration tests verify error messages

### QR2: Cross-Platform Compatibility

**Requirement:** Works on macOS, Linux, Windows
**Target:** Path operations use Node's `path` module
**Validation:** CI tests on multiple platforms

### QR3: Performance

**Requirement:** Symlink detection doesn't degrade performance
**Target:** Cycle detection uses Set for O(1) lookup
**Validation:** Integration tests complete quickly

## Completion Criteria

- [ ] All Level 1 and Level 2 tests pass
- [ ] Permission errors handled gracefully
- [ ] Symlink cycles detected and avoided
- [ ] Cross-platform path handling works
- [ ] BDD structure (GIVEN/WHEN/THEN) in all tests
- [ ] 100% type coverage

## Documentation

1. JSDoc comments on edge case handling
2. Examples of error scenarios
3. Cross-platform path handling notes
