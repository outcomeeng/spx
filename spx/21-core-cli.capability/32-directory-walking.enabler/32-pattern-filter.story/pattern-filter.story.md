# Story: Pattern Filter

## Functional Requirements

### FR1: Filter directories by work item pattern

```gherkin
GIVEN a list of directory entries
WHEN filtering by work item patterns
THEN return only capability/feature/story directories
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Add `filterWorkItemDirectories()` function
2. Uses `parseWorkItemName()` from Feature 21

### FR2: Exclude non-work-item directories

```gherkin
GIVEN a tree with mixed directories (specs, node_modules, etc.)
WHEN filtering
THEN exclude non-work-item directories
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Add exclusion logic

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component           | Level | Justification                                 |
| ------------------- | ----- | --------------------------------------------- |
| Pattern matching    | 1     | Pure function using Feature 21's parser       |
| Directory filtering | 1     | Pure function, no filesystem needed for logic |
| Exclusion rules     | 1     | Pure boolean logic                            |

### When to Escalate

This story stays at Level 1 because:

- Filtering is pure logic over data structures
- Uses Feature 21's `parseWorkItemName()` which is already tested
- No filesystem operations needed for filtering logic

## Unit Tests (Level 1)

```typescript
// test/unit/scanner/walk.test.ts
import { filterWorkItemDirectories } from "@/scanner/walk";
import { describe, expect, it } from "vitest";

describe("filterWorkItemDirectories", () => {
  /**
   * Level 1: Pure function tests for directory filtering
   */

  it("GIVEN directories with work item names WHEN filtering THEN includes them", () => {
    // Given
    const entries = [
      { name: "capability-21_core-cli", path: "/specs/capability-21_core-cli" },
      { name: "feature-32_walk", path: "/specs/cap/feature-32_walk" },
      { name: "story-21_test", path: "/specs/cap/feat/story-21_test" },
    ];

    // When
    const filtered = filterWorkItemDirectories(entries);

    // Then
    expect(filtered).toHaveLength(3);
  });

  it("GIVEN directories with non-work-item names WHEN filtering THEN excludes them", () => {
    // Given
    const entries = [
      { name: "node_modules", path: "/specs/node_modules" },
      { name: "dist", path: "/specs/dist" },
      { name: ".git", path: "/specs/.git" },
      { name: "capability-21_core-cli", path: "/specs/capability-21_core-cli" },
    ];

    // When
    const filtered = filterWorkItemDirectories(entries);

    // Then
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("capability-21_core-cli");
  });

  it("GIVEN mixed valid and invalid patterns WHEN filtering THEN includes only valid", () => {
    // Given
    const entries = [
      { name: "capability-21_test", path: "/specs/capability-21_test" },
      { name: "invalid-pattern", path: "/specs/invalid-pattern" },
      { name: "feature-32_walk", path: "/specs/feature-32_walk" },
      { name: "README.md", path: "/specs/README.md" },
    ];

    // When
    const filtered = filterWorkItemDirectories(entries);

    // Then
    expect(filtered).toHaveLength(2);
    expect(filtered.map((f) => f.name)).toEqual([
      "capability-21_test",
      "feature-32_walk",
    ]);
  });
});
```

## Quality Requirements

### QR1: Reuse Feature 21

**Requirement:** Use `parseWorkItemName()` from Feature 21
**Target:** No duplicate pattern matching logic
**Validation:** Code review confirms reuse

### QR2: Type Safety

**Requirement:** Filter function has strict types
**Target:** `filterWorkItemDirectories(entries: DirectoryEntry[]): DirectoryEntry[]`
**Validation:** TypeScript enforces types

### QR3: No False Positives

**Requirement:** Only valid work item directories pass filter
**Target:** Invalid patterns are excluded
**Validation:** Unit tests verify exclusion

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Reuses Feature 21's pattern matching
- [ ] Excludes non-work-item directories
- [ ] BDD structure (GIVEN/WHEN/THEN) in all tests
- [ ] 100% type coverage

## Documentation

1. JSDoc comments on `filterWorkItemDirectories` function
2. Examples showing filtering behavior
