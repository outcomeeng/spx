# Story: Table Formatter

## Functional Requirements

### FR1: Render tree as compact table

```gherkin
GIVEN a tree structure
WHEN formatting as table
THEN produce aligned table with columns
```

Format:

```
| Level      | Number | Name                 | Status      |
|------------|--------|----------------------|-------------|
| Capability | 21     | core-cli             | IN_PROGRESS |
|   Feature  | 32     | directory-walking    | IN_PROGRESS |
|     Story  | 21     | recursive-walk       | DONE        |
```

#### Files created/modified

1. `src/reporter/table.ts` [new]: Implement `formatTable()` function

## Testing Strategy

### Level Assignment

| Component        | Level | Justification            |
| ---------------- | ----- | ------------------------ |
| Table generation | 1     | Pure string formatting   |
| Column alignment | 1     | Pure logic               |
| Border drawing   | 1     | Pure string manipulation |

## Unit Tests (Level 1)

```typescript
// test/unit/reporter/table.test.ts
import { formatTable } from "@/reporter/table";
import { describe, expect, it } from "vitest";

describe("formatTable", () => {
  it("GIVEN tree WHEN formatting THEN includes table borders", () => {
    const tree = buildSimpleTree();
    const output = formatTable(tree);

    expect(output).toMatch(/\|.*\|/);
  });

  it("GIVEN tree WHEN formatting THEN includes header row", () => {
    const tree = buildSimpleTree();
    const output = formatTable(tree);

    expect(output).toContain("| Level");
    expect(output).toContain("| Number");
    expect(output).toContain("| Name");
    expect(output).toContain("| Status");
  });

  it("GIVEN tree WHEN formatting THEN includes separator row", () => {
    const tree = buildSimpleTree();
    const output = formatTable(tree);

    expect(output).toMatch(/\|[-]+\|/);
  });

  it("GIVEN tree WHEN formatting THEN indents child levels", () => {
    const tree = buildTreeWithStories();
    const output = formatTable(tree);

    expect(output).toContain("| Capability");
    expect(output).toContain("|   Feature");
    expect(output).toContain("|     Story");
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Table borders correct
- [ ] Column alignment works
- [ ] Indentation shows hierarchy
- [ ] 100% type coverage
