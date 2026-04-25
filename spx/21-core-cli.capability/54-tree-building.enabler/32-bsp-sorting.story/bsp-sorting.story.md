# Story: BSP Sorting

## Functional Requirements

### FR1: Sort work items by BSP number

```gherkin
GIVEN work items at same level with different BSP numbers
WHEN building tree
THEN sort children by BSP number ascending
```

#### Files created/modified

1. `src/tree/build.ts` [modify]: Add sorting logic to `buildTree()`

## Testing Strategy

### Level Assignment

| Component      | Level | Justification            |
| -------------- | ----- | ------------------------ |
| BSP sorting    | 1     | Pure comparison function |
| Sort stability | 1     | Pure array sorting       |

## Unit Tests (Level 1)

```typescript
// test/unit/tree/build.test.ts (continued)
describe("buildTree - BSP Sorting", () => {
  it("GIVEN features with mixed BSP numbers WHEN building tree THEN sorted ascending", () => {
    // Given
    const workItems = [
      {
        ...createWorkItem({ kind: "capability", number: 20, slug: "test" }),
        path: "/specs/capability-21_test",
      },
      {
        ...createWorkItem({ kind: "feature", number: 65, slug: "feat3" }),
        path: "/specs/capability-21_test/feature-65_feat3",
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
    const features = tree.capabilities[0].features;
    expect(features.map(f => f.number)).toEqual([32, 43, 65]);
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Children sorted by BSP number
- [ ] Stable sort (preserves equal elements order)
- [ ] 100% type coverage
