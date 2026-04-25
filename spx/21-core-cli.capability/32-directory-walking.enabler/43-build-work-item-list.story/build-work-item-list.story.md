# Story: Build Work Item List

## Functional Requirements

### FR1: Convert directory entries to WorkItem objects

```gherkin
GIVEN filtered directory entries
WHEN building work item list
THEN parse each into WorkItem with kind, number, slug, and path
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Add `buildWorkItemList()` function
2. `src/types.ts` [modify]: Extend `WorkItem` to include `path` field

### FR2: Preserve directory hierarchy information

```gherkin
GIVEN nested work items (capability > feature > story)
WHEN building work item list
THEN include full path for each work item
```

#### Files created/modified

1. `src/scanner/walk.ts` [modify]: Include path information in work items

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component             | Level | Justification            |
| --------------------- | ----- | ------------------------ |
| Directory to WorkItem | 1     | Pure data transformation |
| Path extraction       | 1     | Pure function            |
| List building         | 1     | Pure function over data  |

### When to Escalate

This story stays at Level 1 because:

- Pure data transformation from directory entries to work items
- Uses Feature 21's `parseWorkItemName()` for parsing
- No filesystem operations or external dependencies

## Unit Tests (Level 1)

```typescript
// test/unit/scanner/walk.test.ts (continued)
import { buildWorkItemList } from "@/scanner/walk";
import { describe, expect, it } from "vitest";

describe("buildWorkItemList", () => {
  /**
   * Level 1: Pure function tests for work item list building
   */

  it("GIVEN directory entries WHEN building list THEN creates WorkItem objects", () => {
    // Given
    const entries = [
      { name: "capability-21_core-cli", path: "/specs/capability-21_core-cli" },
      {
        name: "feature-32_walk",
        path: "/specs/capability-21_core-cli/feature-32_walk",
      },
    ];

    // When
    const workItems = buildWorkItemList(entries);

    // Then
    expect(workItems).toHaveLength(2);
    expect(workItems[0]).toEqual({
      kind: "capability",
      number: 20,
      slug: "core-cli",
      path: "/specs/capability-21_core-cli",
    });
  });

  it("GIVEN entries with all three kinds WHEN building list THEN parses each correctly", () => {
    // Given
    const entries = [
      { name: "capability-21_test", path: "/specs/capability-21_test" },
      { name: "feature-32_test", path: "/specs/cap/feature-32_test" },
      { name: "story-43_test", path: "/specs/cap/feat/story-43_test" },
    ];

    // When
    const workItems = buildWorkItemList(entries);

    // Then
    expect(workItems[0].kind).toBe("capability");
    expect(workItems[1].kind).toBe("feature");
    expect(workItems[2].kind).toBe("story");
  });

  it("GIVEN invalid directory entry WHEN building list THEN throws error", () => {
    // Given
    const entries = [{
      name: "invalid-pattern",
      path: "/specs/invalid-pattern",
    }];

    // When/Then
    expect(() => buildWorkItemList(entries)).toThrow("Invalid work item name");
  });

  it("GIVEN empty entries array WHEN building list THEN returns empty array", () => {
    // Given
    const entries: DirectoryEntry[] = [];

    // When
    const workItems = buildWorkItemList(entries);

    // Then
    expect(workItems).toEqual([]);
  });
});
```

## Quality Requirements

### QR1: Type Safety

**Requirement:** WorkItem type includes path field
**Target:** `type WorkItem = { kind, number, slug, path }`
**Validation:** TypeScript enforces complete type

### QR2: Error Propagation

**Requirement:** Invalid entries cause clear errors
**Target:** Use Feature 21's error messages
**Validation:** Unit tests verify error handling

### QR3: Immutability

**Requirement:** Function returns new array, doesn't mutate input
**Target:** Pure function behavior
**Validation:** Unit tests verify immutability

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] WorkItem type extended with path field
- [ ] Error handling for invalid entries
- [ ] BDD structure (GIVEN/WHEN/THEN) in all tests
- [ ] 100% type coverage

## Documentation

1. JSDoc comments on `buildWorkItemList` function
2. Type definition for extended WorkItem
3. Examples showing path preservation
