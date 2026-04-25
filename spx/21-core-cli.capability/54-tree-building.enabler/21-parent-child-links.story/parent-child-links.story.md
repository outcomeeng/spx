# Story: Parent-Child Links

## Functional Requirements

### FR1: Build parent-child relationships from paths

```gherkin
GIVEN flat list of work items with paths
WHEN building tree structure
THEN create parent-child links based on directory hierarchy
```

#### Files created/modified

1. `src/tree/build.ts` [new]: Implement `buildTree()` function
2. `src/types.ts` [modify]: Add tree node types

### FR2: Handle three-level hierarchy

```gherkin
GIVEN capabilities, features, and stories
WHEN building tree
THEN capabilities contain features contain stories
```

#### Files created/modified

1. `src/tree/build.ts` [modify]: Handle all three levels

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component          | Level | Justification                |
| ------------------ | ----- | ---------------------------- |
| Parent detection   | 1     | Pure path analysis           |
| Child linking      | 1     | Pure data structure building |
| Hierarchy assembly | 1     | Pure tree construction       |

### When to Escalate

This story stays at Level 1 because:

- Tree building is pure data transformation
- Path-based parent detection is pure logic
- No filesystem or external dependencies

## Unit Tests (Level 1)

```typescript
// test/unit/tree/build.test.ts
import { buildTree } from "@/tree/build";
import { createWorkItem } from "@test/fixtures/factories";
import { describe, expect, it } from "vitest";

describe("buildTree - Parent-Child Links", () => {
  /**
   * Level 1: Pure function tests for tree building
   */

  it("GIVEN capability with feature WHEN building tree THEN feature is child of capability", () => {
    // Given
    const workItems = [
      {
        ...createWorkItem({ kind: "capability", number: 20, slug: "test" }),
        path: "/specs/capability-21_test",
      },
      {
        ...createWorkItem({ kind: "feature", number: 32, slug: "feat" }),
        path: "/specs/capability-21_test/feature-32_feat",
      },
    ];

    // When
    const tree = buildTree(workItems);

    // Then
    expect(tree.capabilities).toHaveLength(1);
    expect(tree.capabilities[0].features).toHaveLength(1);
    expect(tree.capabilities[0].features[0].slug).toBe("feat");
  });

  it("GIVEN feature with story WHEN building tree THEN story is child of feature", () => {
    // Given
    const workItems = [
      {
        ...createWorkItem({ kind: "capability", number: 20, slug: "test" }),
        path: "/specs/capability-21_test",
      },
      {
        ...createWorkItem({ kind: "feature", number: 32, slug: "feat" }),
        path: "/specs/capability-21_test/feature-32_feat",
      },
      {
        ...createWorkItem({ kind: "story", number: 21, slug: "story" }),
        path: "/specs/capability-21_test/feature-32_feat/story-21_story",
      },
    ];

    // When
    const tree = buildTree(workItems);

    // Then
    const feature = tree.capabilities[0].features[0];
    expect(feature.stories).toHaveLength(1);
    expect(feature.stories[0].slug).toBe("story");
  });

  it("GIVEN capability with multiple features WHEN building tree THEN all features linked", () => {
    // Given
    const workItems = [
      {
        ...createWorkItem({ kind: "capability", number: 20, slug: "test" }),
        path: "/specs/capability-21_test",
      },
      {
        ...createWorkItem({ kind: "feature", number: 32, slug: "feat1" }),
        path: "/specs/capability-21_test/feature-32_feat1",
      },
      {
        ...createWorkItem({ kind: "feature", number: 43, slug: "feat2" }),
        path: "/specs/capability-21_test/feature-43_feat2",
      },
    ];

    // When
    const tree = buildTree(workItems);

    // Then
    expect(tree.capabilities[0].features).toHaveLength(2);
  });

  it("GIVEN orphan work items WHEN building tree THEN throws error", () => {
    // Given: Story without parent feature
    const workItems = [
      {
        ...createWorkItem({ kind: "story", number: 21, slug: "orphan" }),
        path: "/specs/story-21_orphan",
      },
    ];

    // When/Then
    expect(() => buildTree(workItems)).toThrow(/orphan|parent/i);
  });
});
```

## Quality Requirements

### QR1: Type Safety

**Requirement:** Tree nodes strongly typed
**Target:** `CapabilityNode`, `FeatureNode`, `StoryNode` types
**Validation:** TypeScript enforces type structure

### QR2: Immutability

**Requirement:** buildTree doesn't mutate input
**Target:** Returns new tree structure
**Validation:** Unit tests verify input unchanged

### QR3: Orphan Detection

**Requirement:** Detect work items without valid parents
**Target:** Throw error for orphans with descriptive message
**Validation:** Unit test verifies orphan detection

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Parent-child relationships correct
- [ ] Three-level hierarchy works
- [ ] Orphan detection implemented
- [ ] BDD structure (GIVEN/WHEN/THEN) in all tests
- [ ] 100% type coverage

## Documentation

1. JSDoc comments on `buildTree` function
2. Type definitions for tree nodes
3. Examples showing hierarchy
