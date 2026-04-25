import { formatTable } from "@/reporter/table";
import { buildSimpleTree, buildTreeWithStories } from "@test/harness/tree-builder";
import { describe, expect, it } from "vitest";

describe("formatTable", () => {
  describe("GIVEN tree", () => {
    it("WHEN formatting THEN includes table borders", () => {
      const tree = buildSimpleTree();
      const output = formatTable(tree);

      expect(output).toMatch(/\|.*\|/);
    });
  });

  describe("GIVEN table structure", () => {
    it("WHEN formatting THEN includes header row", () => {
      const tree = buildSimpleTree();
      const output = formatTable(tree);

      expect(output).toContain("| Level");
      expect(output).toContain("| Number");
      expect(output).toContain("| Name");
      expect(output).toContain("| Status");
    });

    it("WHEN formatting THEN includes separator row", () => {
      const tree = buildSimpleTree();
      const output = formatTable(tree);

      expect(output).toMatch(/\|[-]+\|/);
    });
  });

  describe("GIVEN tree with stories", () => {
    it("WHEN formatting THEN indents child levels", () => {
      const tree = buildTreeWithStories();
      const output = formatTable(tree);

      expect(output).toContain("| Capability");
      expect(output).toContain("|   Feature");
      expect(output).toContain("|     Story");
    });
  });

  describe("GIVEN work items with display numbers", () => {
    it("WHEN formatting capability THEN shows internal + 1", () => {
      const tree = buildSimpleTree();
      const output = formatTable(tree);

      // Internal number is 20, display should be 21
      expect(output).toMatch(/\|\s*21\s*\|/);
    });

    it("WHEN formatting features and stories THEN shows as-is", () => {
      const tree = buildTreeWithStories();
      const output = formatTable(tree);

      // Features and stories use internal number as-is
      expect(output).toMatch(/\|\s*21\s*\|.*test.*\|/);
    });
  });

  describe("GIVEN table with dynamic widths", () => {
    it("WHEN formatting THEN columns are aligned", () => {
      const tree = buildTreeWithStories();
      const output = formatTable(tree);

      // All rows should have the same pipe positions (aligned columns)
      const lines = output.split("\n").filter((line) => line.includes("|"));
      const pipePositions = lines.map((line) => Array.from(line.matchAll(/\|/g)).map((m) => m.index));

      // All rows should have pipes at the same positions
      const firstRowPipes = pipePositions[0];
      for (const rowPipes of pipePositions) {
        expect(rowPipes).toEqual(firstRowPipes);
      }
    });
  });
});
