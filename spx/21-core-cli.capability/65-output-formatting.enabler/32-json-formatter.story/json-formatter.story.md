# Story: JSON Formatter

## Functional Requirements

### FR1: Render tree as valid JSON

```gherkin
GIVEN a tree structure
WHEN formatting as JSON
THEN produce valid, parseable JSON with full tree data
```

Schema:

```json
{
  "summary": {
    "done": 5,
    "inProgress": 3,
    "open": 2
  },
  "capabilities": [
    {
      "kind": "capability",
      "number": 20,
      "slug": "core-cli",
      "status": "IN_PROGRESS",
      "features": [...]
    }
  ]
}
```

#### Files created/modified

1. `src/reporter/json.ts` [new]: Implement `formatJSON()` function

## Testing Strategy

### Level Assignment

| Component           | Level | Justification            |
| ------------------- | ----- | ------------------------ |
| JSON serialization  | 1     | Pure data transformation |
| Summary calculation | 1     | Pure aggregation         |
| Schema validation   | 1     | Pure structure check     |

## Unit Tests (Level 1)

```typescript
// test/unit/reporter/json.test.ts
import { formatJSON } from "@/reporter/json";
import { describe, expect, it } from "vitest";

describe("formatJSON", () => {
  it("GIVEN tree WHEN formatting THEN produces valid JSON", () => {
    const tree = buildSimpleTree();
    const output = formatJSON(tree);

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("GIVEN tree WHEN formatting THEN includes summary", () => {
    const tree = buildTreeWithMixedStatus();
    const output = formatJSON(tree);
    const parsed = JSON.parse(output);

    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.done).toBeGreaterThan(0);
    expect(parsed.summary.inProgress).toBeGreaterThan(0);
    expect(parsed.summary.open).toBeGreaterThan(0);
  });

  it("GIVEN tree WHEN formatting THEN includes all work item data", () => {
    const tree = buildTreeWithStories();
    const output = formatJSON(tree);
    const parsed = JSON.parse(output);

    expect(parsed.capabilities[0].kind).toBe("capability");
    expect(parsed.capabilities[0].number).toBeDefined();
    expect(parsed.capabilities[0].slug).toBeDefined();
    expect(parsed.capabilities[0].features).toBeInstanceOf(Array);
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Valid JSON output
- [ ] Summary included
- [ ] Complete work item data
- [ ] 100% type coverage
