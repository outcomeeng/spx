import { formatText } from "@/reporter/text";
import {
  buildSimpleTree,
  buildTreeWithFeatures,
  buildTreeWithStatus,
  buildTreeWithStories,
} from "@test/harness/tree-builder";
import { describe, expect, it } from "vitest";

describe("formatText", () => {
  describe("GIVEN tree with capability", () => {
    it("WHEN formatting THEN renders with no indentation", () => {
      const tree = buildSimpleTree();
      const output = formatText(tree);

      expect(output).toContain("capability-21_test");
      expect(output).not.toMatch(/^\s+capability/m);
    });
  });

  describe("GIVEN tree with features", () => {
    it("WHEN formatting THEN renders with 2-space indentation", () => {
      const tree = buildTreeWithFeatures();
      const output = formatText(tree);

      expect(output).toMatch(/^ {2}feature-21_test/m);
      expect(output).toMatch(/^ {2}feature-32_test/m);
    });
  });

  describe("GIVEN tree with stories", () => {
    it("WHEN formatting THEN renders with 4-space indentation", () => {
      const tree = buildTreeWithStories();
      const output = formatText(tree);

      expect(output).toMatch(/^ {4}story-21_test/m);
      expect(output).toMatch(/^ {4}story-32_test/m);
    });
  });

  describe("GIVEN work items with status", () => {
    it("WHEN formatting THEN includes status", () => {
      const tree = buildTreeWithStatus();
      const output = formatText(tree);

      expect(output).toContain("[DONE]");
      expect(output).toContain("[IN_PROGRESS]");
      expect(output).toContain("[OPEN]");
    });
  });

  describe("GIVEN work items with display numbers", () => {
    it("WHEN formatting capability THEN shows internal + 1", () => {
      const tree = buildSimpleTree();
      const output = formatText(tree);

      // Internal number is 20, display should be 21
      expect(output).toContain("capability-21");
    });

    it("WHEN formatting features and stories THEN shows as-is", () => {
      const tree = buildTreeWithStories();
      const output = formatText(tree);

      // Features and stories use internal number as-is
      expect(output).toContain("feature-21");
      expect(output).toContain("story-21");
      expect(output).toContain("story-32");
    });
  });
});
