# Story: Text Formatter

## Functional Requirements

### FR1: Render tree as text with indentation

```gherkin
GIVEN a tree structure
WHEN formatting as text
THEN render hierarchical tree with proper indentation
```

Output format:

```
capability-21_core-cli [DONE]
  feature-32_directory-walking [IN_PROGRESS]
    story-21_recursive-walk [DONE]
    story-32_pattern-filter [OPEN]
```

#### Files created/modified

1. `src/reporter/text.ts` [new]: Implement `formatText()` function

## Testing Strategy

### Level Assignment

| Component         | Level | Justification             |
| ----------------- | ----- | ------------------------- |
| Text rendering    | 1     | Pure string formatting    |
| Indentation logic | 1     | Pure function             |
| Status display    | 1     | Pure string interpolation |

## Unit Tests (Level 1)

```typescript
// test/unit/reporter/text.test.ts
import { formatText } from "@/reporter/text";
import { describe, expect, it } from "vitest";

describe("formatText", () => {
  it("GIVEN tree with capability WHEN formatting THEN renders with no indentation", () => {
    const tree = buildSimpleTree();
    const output = formatText(tree);

    expect(output).toContain("capability-21_test");
    expect(output).not.toMatch(/^\s+capability/m);
  });

  it("GIVEN tree with features WHEN formatting THEN renders with 2-space indentation", () => {
    const tree = buildTreeWithFeatures();
    const output = formatText(tree);

    expect(output).toMatch(/^  feature-32_test/m);
  });

  it("GIVEN tree with stories WHEN formatting THEN renders with 4-space indentation", () => {
    const tree = buildTreeWithStories();
    const output = formatText(tree);

    expect(output).toMatch(/^    story-21_test/m);
  });

  it("GIVEN work items with status WHEN formatting THEN includes status", () => {
    const tree = buildTreeWithStatus();
    const output = formatText(tree);

    expect(output).toContain("[DONE]");
    expect(output).toContain("[IN_PROGRESS]");
    expect(output).toContain("[OPEN]");
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Hierarchical indentation correct
- [ ] Status included in output
- [ ] 100% type coverage
