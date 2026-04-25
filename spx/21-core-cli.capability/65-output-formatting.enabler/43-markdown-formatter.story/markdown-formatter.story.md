# Story: Markdown Formatter

## Functional Requirements

### FR1: Render tree as markdown with headings

```gherkin
GIVEN a tree structure
WHEN formatting as markdown
THEN produce markdown with heading hierarchy
```

Format:

```markdown
# capability-21_core-cli

Status: IN_PROGRESS

## feature-32_directory-walking

Status: IN_PROGRESS

### story-21_recursive-walk

Status: DONE
```

#### Files created/modified

1. `src/reporter/markdown.ts` [new]: Implement `formatMarkdown()` function

## Testing Strategy

### Level Assignment

| Component           | Level | Justification          |
| ------------------- | ----- | ---------------------- |
| Markdown generation | 1     | Pure string formatting |
| Heading levels      | 1     | Pure logic             |

## Unit Tests (Level 1)

```typescript
// test/unit/reporter/markdown.test.ts
import { formatMarkdown } from "@/reporter/markdown";
import { describe, expect, it } from "vitest";

describe("formatMarkdown", () => {
  it("GIVEN tree WHEN formatting THEN uses # for capabilities", () => {
    const tree = buildSimpleTree();
    const output = formatMarkdown(tree);

    expect(output).toMatch(/^# capability-/m);
  });

  it("GIVEN tree WHEN formatting THEN uses ## for features", () => {
    const tree = buildTreeWithFeatures();
    const output = formatMarkdown(tree);

    expect(output).toMatch(/^## feature-/m);
  });

  it("GIVEN tree WHEN formatting THEN uses ### for stories", () => {
    const tree = buildTreeWithStories();
    const output = formatMarkdown(tree);

    expect(output).toMatch(/^### story-/m);
  });

  it("GIVEN tree WHEN formatting THEN includes status lines", () => {
    const tree = buildTreeWithStatus();
    const output = formatMarkdown(tree);

    expect(output).toContain("Status: DONE");
    expect(output).toContain("Status: IN_PROGRESS");
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Correct heading levels
- [ ] Status included
- [ ] 100% type coverage
