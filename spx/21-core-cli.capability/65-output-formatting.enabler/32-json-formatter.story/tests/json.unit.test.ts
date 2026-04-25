import { DEFAULT_CONFIG } from "@/config/defaults";
import { formatJSON } from "@/reporter/json";
import { WORK_ITEM_KINDS } from "@/types";
import { buildSimpleTree, buildTreeWithMixedStatus, buildTreeWithStories } from "@test/harness/tree-builder";
import { describe, expect, it } from "vitest";

describe("formatJSON", () => {
  describe("GIVEN tree", () => {
    it("WHEN formatting THEN produces valid JSON", () => {
      const tree = buildSimpleTree();
      const output = formatJSON(tree, DEFAULT_CONFIG);

      expect(() => JSON.parse(output)).not.toThrow();
    });
  });

  describe("GIVEN tree with mixed status", () => {
    it("WHEN formatting THEN includes summary", () => {
      const tree = buildTreeWithMixedStatus();
      const output = formatJSON(tree, DEFAULT_CONFIG);
      const parsed = JSON.parse(output);

      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.done).toBeDefined();
      expect(parsed.summary.inProgress).toBeDefined();
      expect(parsed.summary.open).toBeDefined();
    });

    it("WHEN formatting THEN counts capabilities and features only", () => {
      const tree = buildTreeWithMixedStatus();
      const output = formatJSON(tree, DEFAULT_CONFIG);
      const parsed = JSON.parse(output);

      // Tree has: 1 cap (IN_PROGRESS), 3 features (DONE, IN_PROGRESS, OPEN)
      // Stories should NOT be counted
      expect(parsed.summary.done).toBe(1); // 1 DONE feature
      expect(parsed.summary.inProgress).toBe(2); // 1 cap + 1 feature
      expect(parsed.summary.open).toBe(1); // 1 OPEN feature
    });
  });

  describe("GIVEN tree with stories", () => {
    it("WHEN formatting THEN includes all work item data", () => {
      const tree = buildTreeWithStories();
      const output = formatJSON(tree, DEFAULT_CONFIG);
      const parsed = JSON.parse(output);

      expect(parsed.capabilities).toBeDefined();
      expect(parsed.capabilities[0].kind).toBe(WORK_ITEM_KINDS[0]);
      expect(parsed.capabilities[0].number).toBeDefined();
      expect(parsed.capabilities[0].slug).toBeDefined();
      expect(parsed.capabilities[0].features).toBeInstanceOf(Array);
    });

    it("WHEN formatting THEN uses display numbers for capabilities", () => {
      const tree = buildSimpleTree();
      const output = formatJSON(tree, DEFAULT_CONFIG);
      const parsed = JSON.parse(output);

      // Internal number is 20, display should be 21
      expect(parsed.capabilities[0].number).toBe(21);
    });

    it("WHEN formatting THEN uses as-is numbers for features and stories", () => {
      const tree = buildTreeWithStories();
      const output = formatJSON(tree, DEFAULT_CONFIG);
      const parsed = JSON.parse(output);

      // Features and stories use internal number as-is
      expect(parsed.capabilities[0].features[0].number).toBe(21);
      expect(parsed.capabilities[0].features[0].stories[0].number).toBe(21);
    });
  });

  describe("GIVEN formatted JSON", () => {
    it("WHEN parsing THEN uses 2-space indentation", () => {
      const tree = buildSimpleTree();
      const output = formatJSON(tree, DEFAULT_CONFIG);

      // Check for 2-space indentation patterns
      expect(output).toContain("  \"summary\"");
      expect(output).toContain("  \"capabilities\"");
    });
  });
});
