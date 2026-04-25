import { formatMarkdown } from "@/reporter/markdown";
import {
  buildSimpleTree,
  buildTreeWithFeatures,
  buildTreeWithStatus,
  buildTreeWithStories,
} from "@test/harness/tree-builder";
import { describe, expect, it } from "vitest";

describe("formatMarkdown", () => {
  describe("GIVEN tree", () => {
    it("WHEN formatting THEN uses # for capabilities", () => {
      const tree = buildSimpleTree();
      const output = formatMarkdown(tree);

      expect(output).toMatch(/^# capability-/m);
    });
  });

  describe("GIVEN tree with features", () => {
    it("WHEN formatting THEN uses ## for features", () => {
      const tree = buildTreeWithFeatures();
      const output = formatMarkdown(tree);

      expect(output).toMatch(/^## feature-/m);
    });
  });

  describe("GIVEN tree with stories", () => {
    it("WHEN formatting THEN uses ### for stories", () => {
      const tree = buildTreeWithStories();
      const output = formatMarkdown(tree);

      expect(output).toMatch(/^### story-/m);
    });
  });

  describe("GIVEN tree with status", () => {
    it("WHEN formatting THEN includes status lines", () => {
      const tree = buildTreeWithStatus();
      const output = formatMarkdown(tree);

      expect(output).toContain("Status: DONE");
      expect(output).toContain("Status: IN_PROGRESS");
      expect(output).toContain("Status: OPEN");
    });
  });

  describe("GIVEN work items with display numbers", () => {
    it("WHEN formatting capability THEN shows internal + 1", () => {
      const tree = buildSimpleTree();
      const output = formatMarkdown(tree);

      // Internal number is 20, display should be 21
      expect(output).toContain("# capability-21");
    });

    it("WHEN formatting features and stories THEN shows as-is", () => {
      const tree = buildTreeWithStories();
      const output = formatMarkdown(tree);

      // Features and stories use internal number as-is
      expect(output).toContain("## feature-21");
      expect(output).toContain("### story-21");
      expect(output).toContain("### story-32");
    });
  });
});
