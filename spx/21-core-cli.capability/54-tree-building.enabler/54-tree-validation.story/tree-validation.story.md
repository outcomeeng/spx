# Story: Tree Validation

## Functional Requirements

### FR1: Validate tree structure constraints

```gherkin
GIVEN a built tree
WHEN validating
THEN verify all invariants hold (no cycles, correct hierarchy, etc.)
```

Constraints:

- Stories only under features
- Features only under capabilities
- No cycles
- No duplicate BSP numbers at same level

#### Files created/modified

1. `src/tree/validate.ts` [new]: Implement `validateTree()` function

## Testing Strategy

### Level Assignment

| Component            | Level | Justification        |
| -------------------- | ----- | -------------------- |
| Hierarchy validation | 1     | Pure structure check |
| Duplicate detection  | 1     | Pure comparison      |
| Cycle detection      | 1     | Pure graph traversal |

## Unit Tests (Level 1)

```typescript
// test/unit/tree/validate.test.ts
import { validateTree } from "@/tree/validate";
import { describe, expect, it } from "vitest";

describe("validateTree", () => {
  it("GIVEN valid tree WHEN validating THEN returns true", () => {
    const tree = buildValidTree();
    expect(() => validateTree(tree)).not.toThrow();
  });

  it("GIVEN duplicate BSP numbers at same level WHEN validating THEN throws error", () => {
    const tree = buildTreeWithDuplicates();
    expect(() => validateTree(tree)).toThrow(/duplicate/i);
  });

  it("GIVEN story not under feature WHEN validating THEN throws error", () => {
    const tree = buildTreeWithOrphanStory();
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] All tree constraints validated
- [ ] Descriptive error messages
- [ ] 100% type coverage
