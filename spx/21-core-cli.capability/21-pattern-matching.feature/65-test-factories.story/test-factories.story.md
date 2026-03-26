# Story: Test Factories

## Functional Requirements

### FR1: Factory functions for generating test work item names

```gherkin
GIVEN test parameters (kind, number, slug)
WHEN generating a test work item name
THEN return a valid directory name matching the pattern
```

#### Files created/modified

1. `test/fixtures/factories.ts` [new]: Implement `createWorkItemName()` factory
2. `test/fixtures/constants.ts` [new]: Define test constants and default values

### FR2: Factory functions for generating WorkItem objects

```gherkin
GIVEN test parameters (kind, number, slug, status)
WHEN generating a test WorkItem object
THEN return a valid object with all required properties
```

#### Files created/modified

1. `test/fixtures/factories.ts` [modify]: Implement `createWorkItem()` factory

### FR3: Randomized test data generation

```gherkin
GIVEN no specific parameters
WHEN generating random test data
THEN create valid work items with randomized but valid values
```

#### Files created/modified

1. `test/fixtures/factories.ts` [modify]: Implement `createRandomWorkItem()` factory

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component              | Level | Justification                    |
| ---------------------- | ----- | -------------------------------- |
| Name factory           | 1     | Pure function, string generation |
| Object factory         | 1     | Pure function, object creation   |
| Random data generation | 1     | Pure function with defaults      |

### When to Escalate

This story stays at Level 1 because:

- Factories are pure data generation functions
- No external dependencies
- Test infrastructure itself is testable at Level 1

## Unit Tests (Level 1)

```typescript
// test/unit/fixtures/factories.test.ts
import { describe, expect, it } from "vitest";
import { createRandomWorkItem, createWorkItem, createWorkItemName } from "../../fixtures/factories";

describe("createWorkItemName", () => {
  /**
   * Level 1: Pure function tests for name factory
   */

  it("GIVEN capability parameters WHEN creating name THEN returns valid pattern", () => {
    // Given
    const kind = "capability";
    const number = 20;
    const slug = "core-cli";

    // When
    const result = createWorkItemName({ kind, number, slug });

    // Then
    expect(result).toBe("capability-21_core-cli");
  });

  it("GIVEN feature parameters WHEN creating name THEN returns valid pattern", () => {
    // Given
    const kind = "feature";
    const number = 21;
    const slug = "pattern-matching";

    // When
    const result = createWorkItemName({ kind, number, slug });

    // Then
    expect(result).toBe("feature-21_pattern-matching");
  });

  it("GIVEN story parameters WHEN creating name THEN returns valid pattern", () => {
    // Given
    const kind = "story";
    const number = 32;
    const slug = "parse-features";

    // When
    const result = createWorkItemName({ kind, number, slug });

    // Then
    expect(result).toBe("story-32_parse-features");
  });

  it("GIVEN only kind WHEN creating name THEN uses default number and slug", () => {
    // Given
    const kind = "capability";

    // When
    const result = createWorkItemName({ kind });

    // Then
    expect(result).toMatch(/^capability-\d{2}_test-/);
  });
});

describe("createWorkItem", () => {
  it("GIVEN all parameters WHEN creating work item THEN returns complete object", () => {
    // Given
    const params = {
      kind: "capability" as const,
      number: 20,
      slug: "core-cli",
    };

    // When
    const result = createWorkItem(params);

    // Then
    expect(result).toEqual({
      kind: "capability",
      number: 20,
      slug: "core-cli",
    });
  });

  it("GIVEN partial parameters WHEN creating work item THEN fills defaults", () => {
    // Given
    const params = {
      kind: "feature" as const,
    };

    // When
    const result = createWorkItem(params);

    // Then
    expect(result.kind).toBe("feature");
    expect(result.number).toBeGreaterThanOrEqual(10);
    expect(result.number).toBeLessThanOrEqual(99);
    expect(result.slug).toBeDefined();
  });
});

describe("createRandomWorkItem", () => {
  it("GIVEN no parameters WHEN creating random work item THEN returns valid object", () => {
    // Given/When
    const result = createRandomWorkItem();

    // Then
    expect(result.kind).toMatch(/^(capability|feature|story)$/);
    expect(result.number).toBeGreaterThanOrEqual(10);
    expect(result.number).toBeLessThanOrEqual(99);
    expect(result.slug).toBeTruthy();
  });

  it("GIVEN multiple calls WHEN creating random work items THEN produces variety", () => {
    // Given/When
    const items = Array.from({ length: 10 }, () => createRandomWorkItem());

    // Then: At least some variation in kinds
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("GIVEN specific kind WHEN creating random work item THEN uses that kind", () => {
    // Given
    const kind = "story";

    // When
    const result = createRandomWorkItem({ kind });

    // Then
    expect(result.kind).toBe("story");
  });
});
```

```typescript
// test/fixtures/factories.ts (implementation reference)
import { DEFAULT_BSP_NUMBER, WORK_ITEM_KINDS } from "./constants";

export interface WorkItem {
  kind: "capability" | "feature" | "story";
  number: number;
  slug: string;
}

export function createWorkItemName(params: {
  kind: WorkItem["kind"];
  number?: number;
  slug?: string;
}): string {
  const number = params.number ?? DEFAULT_BSP_NUMBER;
  const slug = params.slug ?? `test-${Math.random().toString(36).slice(2, 8)}`;
  return `${params.kind}-${String(number).padStart(2, "0")}_${slug}`;
}

export function createWorkItem(
  params: Partial<WorkItem> & { kind: WorkItem["kind"] },
): WorkItem {
  return {
    kind: params.kind,
    number: params.number ?? randomBSPNumber(),
    slug: params.slug ?? `test-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function createRandomWorkItem(params?: Partial<WorkItem>): WorkItem {
  const kinds: WorkItem["kind"][] = ["capability", "feature", "story"];
  const kind = params?.kind ?? kinds[Math.floor(Math.random() * kinds.length)];

  return createWorkItem({
    kind,
    number: params?.number,
    slug: params?.slug,
  });
}

function randomBSPNumber(): number {
  return Math.floor(Math.random() * 90) + 10; // 10-99
}
```

## Architectural Requirements

## Quality Requirements

### QR1: Type Safety

**Requirement:** Factory functions must have strict type signatures
**Target:** Factories return properly typed `WorkItem` objects
**Validation:** TypeScript enforces types

### QR2: No Magic Values

**Requirement:** Default values must come from constants
**Target:** All defaults defined in `test/fixtures/constants.ts`
**Validation:** No hardcoded strings in factory functions

### QR3: Reusability

**Requirement:** Factories used in all future tests
**Target:** No test creates work items manually
**Validation:** Grep shows factories are imported and used

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Factory functions create valid work item names
- [ ] Factory functions create valid WorkItem objects
- [ ] Random data generation produces variety
- [ ] Constants file defines all defaults
- [ ] BDD structure (GIVEN/WHEN/THEN) in all tests

## Documentation

1. JSDoc comments on all factory functions
2. Examples in comments showing common usage patterns
3. Constants documented with their purposes

## Test Infrastructure Note

This story is unique: **the test factories are themselves test infrastructure**. The tests in this story verify that our factory pattern works correctly. Once complete, all future tests (Stories 21-54 and beyond) will use these factories instead of creating test data manually.
