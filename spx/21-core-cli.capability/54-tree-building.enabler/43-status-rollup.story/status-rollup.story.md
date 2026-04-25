# Story: Status Rollup

## Functional Requirements

### FR1: Aggregate status from children

```gherkin
GIVEN parent with children having different statuses
WHEN building tree with status rollup
THEN parent status reflects BOTH own status AND aggregate of children
```

Rules (ownStatus = status from parent's own tests/DONE.md):

- **DONE**: ownStatus is DONE AND all children are DONE
- **OPEN**: ownStatus is OPEN AND all children are OPEN
- **IN_PROGRESS**: everything else (any mismatch between own and child status)

This ensures that features and capabilities require their own tests/DONE.md verification,
not just aggregation from children. Completing all stories is necessary but not sufficient
for a feature to be DONE.

#### Files created/modified

1. `src/tree/build.ts` [modify]: Add `rollupStatus()` function

## Testing Strategy

### Level Assignment

| Component          | Level | Justification      |
| ------------------ | ----- | ------------------ |
| Status aggregation | 1     | Pure boolean logic |
| Rollup rules       | 1     | Pure function      |

## Unit Tests (Level 1)

```typescript
// test/unit/tree/build.test.ts (continued)
describe("buildTree - Status Rollup", () => {
  describe("GIVEN own DONE and all children DONE", () => {
    it("WHEN rolling up status THEN parent is DONE", async () => {
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": "DONE",
        "/specs/capability-21_test/feature-32_feat1": "DONE",
        "/specs/capability-21_test/feature-43_feat2": "DONE",
      };
      const depsWithStatus = { getStatus: async (path) => statusMap[path] || "OPEN" };
      const workItems = [
        createWorkItemWithPath("capability", 20, "test", "/specs/capability-21_test"),
        createWorkItemWithPath("feature", 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
        createWorkItemWithPath("feature", 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
      ];
      const tree = await buildTree(workItems, depsWithStatus);
      expect(tree.nodes[0].status).toBe("DONE");
    });
  });

  describe("GIVEN own OPEN but all children DONE", () => {
    it("WHEN rolling up status THEN parent is IN_PROGRESS (own work pending)", async () => {
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": "OPEN",
        "/specs/capability-21_test/feature-32_feat1": "DONE",
        "/specs/capability-21_test/feature-43_feat2": "DONE",
      };
      const depsWithStatus = { getStatus: async (path) => statusMap[path] || "OPEN" };
      const workItems = [
        createWorkItemWithPath("capability", 20, "test", "/specs/capability-21_test"),
        createWorkItemWithPath("feature", 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
        createWorkItemWithPath("feature", 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
      ];
      const tree = await buildTree(workItems, depsWithStatus);
      expect(tree.nodes[0].status).toBe("IN_PROGRESS");
    });
  });

  describe("GIVEN own DONE but any child IN_PROGRESS", () => {
    it("WHEN rolling up status THEN parent is IN_PROGRESS", async () => {
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": "DONE",
        "/specs/capability-21_test/feature-32_feat1": "DONE",
        "/specs/capability-21_test/feature-43_feat2": "IN_PROGRESS",
      };
      const depsWithStatus = { getStatus: async (path) => statusMap[path] || "OPEN" };
      const workItems = [
        createWorkItemWithPath("capability", 20, "test", "/specs/capability-21_test"),
        createWorkItemWithPath("feature", 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
        createWorkItemWithPath("feature", 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
      ];
      const tree = await buildTree(workItems, depsWithStatus);
      expect(tree.nodes[0].status).toBe("IN_PROGRESS");
    });
  });

  describe("GIVEN own OPEN and all children OPEN", () => {
    it("WHEN rolling up status THEN parent is OPEN", async () => {
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": "OPEN",
        "/specs/capability-21_test/feature-32_feat1": "OPEN",
        "/specs/capability-21_test/feature-43_feat2": "OPEN",
      };
      const depsWithStatus = { getStatus: async (path) => statusMap[path] || "OPEN" };
      const workItems = [
        createWorkItemWithPath("capability", 20, "test", "/specs/capability-21_test"),
        createWorkItemWithPath("feature", 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
        createWorkItemWithPath("feature", 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
      ];
      const tree = await buildTree(workItems, depsWithStatus);
      expect(tree.nodes[0].status).toBe("OPEN");
    });
  });

  describe("GIVEN own IN_PROGRESS and all children OPEN", () => {
    it("WHEN rolling up status THEN parent is IN_PROGRESS", async () => {
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": "IN_PROGRESS",
        "/specs/capability-21_test/feature-32_feat1": "OPEN",
        "/specs/capability-21_test/feature-43_feat2": "OPEN",
      };
      const depsWithStatus = { getStatus: async (path) => statusMap[path] || "OPEN" };
      const workItems = [
        createWorkItemWithPath("capability", 20, "test", "/specs/capability-21_test"),
        createWorkItemWithPath("feature", 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
        createWorkItemWithPath("feature", 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
      ];
      const tree = await buildTree(workItems, depsWithStatus);
      expect(tree.nodes[0].status).toBe("IN_PROGRESS");
    });
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Status rollup rules implemented correctly
- [ ] 100% type coverage
