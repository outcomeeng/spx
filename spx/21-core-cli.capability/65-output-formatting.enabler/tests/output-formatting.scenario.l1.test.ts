import { DEFAULT_CONFIG } from "@/config/defaults";
import { formatJSON } from "@/lib/spec-legacy/reporter/json";
import { formatMarkdown } from "@/lib/spec-legacy/reporter/markdown";
import { formatTable } from "@/lib/spec-legacy/reporter/table";
import { formatText } from "@/lib/spec-legacy/reporter/text";
import { buildTree, TreeBuildDeps } from "@/lib/spec-legacy/tree/build";
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES, type WorkItem } from "@/lib/spec-legacy/types";
import {
  buildSimpleTree,
  buildTreeWithFeatures,
  buildTreeWithMixedStatus,
  buildTreeWithStatus,
  buildTreeWithStories,
} from "@testing/harnesses/tree-builder";
import { describe, expect, it } from "vitest";

// ─── formatText ──────────────────────────────────────────────────────────────

describe("formatText", () => {
  it("GIVEN capability at root WHEN formatting THEN appears with no leading indentation", () => {
    const output = formatText(buildSimpleTree());

    expect(output).toContain("capability-21_test");
    expect(output).not.toMatch(/^\s+capability/m);
  });

  it("GIVEN tree with features WHEN formatting THEN features indented by 2 spaces", () => {
    const output = formatText(buildTreeWithFeatures());

    expect(output).toMatch(/^ {2}feature-21_test/m);
    expect(output).toMatch(/^ {2}feature-32_test/m);
  });

  it("GIVEN tree with stories WHEN formatting THEN stories indented by 4 spaces", () => {
    const output = formatText(buildTreeWithStories());

    expect(output).toMatch(/^ {4}story-21_test/m);
    expect(output).toMatch(/^ {4}story-32_test/m);
  });

  it("GIVEN work items with status WHEN formatting THEN status labels appear in output", () => {
    const output = formatText(buildTreeWithStatus());

    expect(output).toContain("[DONE]");
    expect(output).toContain("[IN_PROGRESS]");
    expect(output).toContain("[OPEN]");
  });

  it("GIVEN capability with internal BSP 20 WHEN formatting THEN shows display number 21", () => {
    const output = formatText(buildSimpleTree());

    expect(output).toContain("capability-21");
  });

  it("GIVEN features and stories WHEN formatting THEN shows BSP numbers as-is", () => {
    const output = formatText(buildTreeWithStories());

    expect(output).toContain("feature-21");
    expect(output).toContain("story-21");
    expect(output).toContain("story-32");
  });
});

// ─── formatJSON ──────────────────────────────────────────────────────────────

describe("formatJSON", () => {
  it("GIVEN any tree WHEN formatting THEN produces valid JSON", () => {
    const output = formatJSON(buildSimpleTree(), DEFAULT_CONFIG);

    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("GIVEN tree with mixed statuses WHEN formatting THEN summary contains done/inProgress/open counts", () => {
    const parsed = JSON.parse(formatJSON(buildTreeWithMixedStatus(), DEFAULT_CONFIG));

    expect(parsed.summary).toBeDefined();
    expect(parsed.summary.done).toBeDefined();
    expect(parsed.summary.inProgress).toBeDefined();
    expect(parsed.summary.open).toBeDefined();
  });

  it("GIVEN tree with mixed statuses WHEN formatting THEN summary counts capabilities and features but not stories", () => {
    const parsed = JSON.parse(formatJSON(buildTreeWithMixedStatus(), DEFAULT_CONFIG));

    // 1 cap IN_PROGRESS, 3 features: DONE, IN_PROGRESS, OPEN — stories excluded
    expect(parsed.summary.done).toBe(1);
    expect(parsed.summary.inProgress).toBe(2);
    expect(parsed.summary.open).toBe(1);
  });

  it("GIVEN tree with stories WHEN formatting THEN capabilities property contains work item data", () => {
    const parsed = JSON.parse(formatJSON(buildTreeWithStories(), DEFAULT_CONFIG));

    expect(parsed.capabilities).toBeDefined();
    expect(parsed.capabilities[0].kind).toBe(WORK_ITEM_KINDS[0]);
    expect(parsed.capabilities[0].number).toBeDefined();
    expect(parsed.capabilities[0].slug).toBeDefined();
    expect(parsed.capabilities[0].features).toBeInstanceOf(Array);
  });

  it("GIVEN capability with internal BSP 20 WHEN formatting THEN JSON shows display number 21", () => {
    const parsed = JSON.parse(formatJSON(buildSimpleTree(), DEFAULT_CONFIG));

    expect(parsed.capabilities[0].number).toBe(21);
  });

  it("GIVEN features and stories WHEN formatting THEN JSON shows BSP numbers as-is", () => {
    const parsed = JSON.parse(formatJSON(buildTreeWithStories(), DEFAULT_CONFIG));

    expect(parsed.capabilities[0].features[0].number).toBe(21);
    expect(parsed.capabilities[0].features[0].stories[0].number).toBe(21);
  });

  it("GIVEN any tree WHEN formatting THEN output uses 2-space indentation", () => {
    const output = formatJSON(buildSimpleTree(), DEFAULT_CONFIG);

    expect(output).toContain("  \"config\"");
    expect(output).toContain("  \"summary\"");
    expect(output).toContain("  \"capabilities\"");
  });

  it("GIVEN any tree WHEN formatting THEN JSON includes config values from supplied config", () => {
    const parsed = JSON.parse(formatJSON(buildSimpleTree(), DEFAULT_CONFIG));

    expect(parsed.config).toBeDefined();
    expect(parsed.config.specs.root).toBe(DEFAULT_CONFIG.specs.root);
    expect(parsed.config.specs.work.dir).toBe(DEFAULT_CONFIG.specs.work.dir);
    expect(parsed.config.specs.work.statusDirs).toEqual(DEFAULT_CONFIG.specs.work.statusDirs);
    expect(parsed.config.sessions.dir).toBe(DEFAULT_CONFIG.sessions.dir);
  });
});

// ─── formatMarkdown ───────────────────────────────────────────────────────────

describe("formatMarkdown", () => {
  it("GIVEN tree with capability WHEN formatting THEN capability renders as # heading", () => {
    expect(formatMarkdown(buildSimpleTree())).toMatch(/^# capability-/m);
  });

  it("GIVEN tree with features WHEN formatting THEN features render as ## headings", () => {
    expect(formatMarkdown(buildTreeWithFeatures())).toMatch(/^## feature-/m);
  });

  it("GIVEN tree with stories WHEN formatting THEN stories render as ### headings", () => {
    expect(formatMarkdown(buildTreeWithStories())).toMatch(/^### story-/m);
  });

  it("GIVEN tree with mixed statuses WHEN formatting THEN status lines appear in output", () => {
    const output = formatMarkdown(buildTreeWithStatus());

    expect(output).toContain("Status: DONE");
    expect(output).toContain("Status: IN_PROGRESS");
    expect(output).toContain("Status: OPEN");
  });

  it("GIVEN capability with internal BSP 20 WHEN formatting THEN shows display number 21", () => {
    expect(formatMarkdown(buildSimpleTree())).toContain("# capability-21");
  });

  it("GIVEN features and stories WHEN formatting THEN shows BSP numbers as-is", () => {
    const output = formatMarkdown(buildTreeWithStories());

    expect(output).toContain("## feature-21");
    expect(output).toContain("### story-21");
    expect(output).toContain("### story-32");
  });
});

// ─── formatTable ─────────────────────────────────────────────────────────────

describe("formatTable", () => {
  it("GIVEN any tree WHEN formatting THEN every row is enclosed with | characters", () => {
    expect(formatTable(buildSimpleTree())).toMatch(/\|.*\|/);
  });

  it("GIVEN any tree WHEN formatting THEN header row contains Level, Number, Name, Status columns", () => {
    const output = formatTable(buildSimpleTree());

    expect(output).toContain("| Level");
    expect(output).toContain("| Number");
    expect(output).toContain("| Name");
    expect(output).toContain("| Status");
  });

  it("GIVEN any tree WHEN formatting THEN separator row of --- cells appears after header", () => {
    expect(formatTable(buildSimpleTree())).toMatch(/\|[-]+\|/);
  });

  it("GIVEN tree with stories WHEN formatting THEN levels appear with correct indentation in Level column", () => {
    const output = formatTable(buildTreeWithStories());

    expect(output).toContain("| Capability");
    expect(output).toContain("|   Feature");
    expect(output).toContain("|     Story");
  });

  it("GIVEN capability with internal BSP 20 WHEN formatting THEN table shows display number 21", () => {
    expect(formatTable(buildSimpleTree())).toMatch(/\|\s*21\s*\|/);
  });

  it("GIVEN tree WHEN formatting THEN | column separators align at the same horizontal position across all rows", () => {
    const output = formatTable(buildTreeWithStories());
    const lines = output.split("\n").filter((line) => line.includes("|"));
    const pipePositions = lines.map((line) => Array.from(line.matchAll(/\|/g)).map((m) => m.index));

    const firstRowPipes = pipePositions[0];
    for (const rowPipes of pipePositions) {
      expect(rowPipes).toEqual(firstRowPipes);
    }
  });
});

// ─── buildTree + formatters integration ──────────────────────────────────────

describe("buildTree + formatters integration", () => {
  const statusResolver: TreeBuildDeps = {
    getStatus: async (p) => {
      if (p.includes("story-21")) return WORK_ITEM_STATUSES[2];
      if (p.includes("story-32")) return WORK_ITEM_STATUSES[1];
      if (p.includes("story-43")) return WORK_ITEM_STATUSES[0];
      return WORK_ITEM_STATUSES[0];
    },
  };

  it("GIVEN real tree from buildTree WHEN formatting as text THEN contains item names and status labels", async () => {
    const workItems: WorkItem[] = [
      { kind: WORK_ITEM_KINDS[0], number: 20, slug: "core-cli", path: "/specs/capability-21_core-cli" },
      {
        kind: WORK_ITEM_KINDS[1],
        number: 32,
        slug: "tree-building",
        path: "/specs/capability-21_core-cli/feature-32_tree-building",
      },
      {
        kind: WORK_ITEM_KINDS[2],
        number: 21,
        slug: "parent-child",
        path: "/specs/capability-21_core-cli/feature-32_tree-building/story-21_parent-child",
      },
      {
        kind: WORK_ITEM_KINDS[2],
        number: 32,
        slug: "sorting",
        path: "/specs/capability-21_core-cli/feature-32_tree-building/story-32_sorting",
      },
    ];

    const output = formatText(await buildTree(workItems, statusResolver));

    expect(output).toContain("capability-21_core-cli");
    expect(output).toContain("feature-32_tree-building");
    expect(output).toContain("story-21_parent-child");
    expect(output).toContain("[DONE]");
    expect(output).toContain("[IN_PROGRESS]");
  });

  it("GIVEN real tree from buildTree WHEN formatting as JSON THEN produces valid JSON with correct display numbers", async () => {
    const workItems: WorkItem[] = [
      { kind: WORK_ITEM_KINDS[0], number: 20, slug: "test", path: "/specs/capability-21_test" },
      {
        kind: WORK_ITEM_KINDS[1],
        number: 32,
        slug: "feat",
        path: "/specs/capability-21_test/feature-32_feat",
      },
    ];

    const tree = await buildTree(workItems, statusResolver);
    const parsed = JSON.parse(formatJSON(tree, DEFAULT_CONFIG));

    expect(parsed.capabilities).toBeDefined();
    expect(parsed.capabilities[0].number).toBe(21);
    expect(parsed.capabilities[0].features[0].number).toBe(32);
  });

  it("GIVEN real tree from buildTree WHEN formatting as markdown THEN uses correct heading levels", async () => {
    const workItems: WorkItem[] = [
      { kind: WORK_ITEM_KINDS[0], number: 20, slug: "test", path: "/specs/capability-21_test" },
      {
        kind: WORK_ITEM_KINDS[1],
        number: 32,
        slug: "feat",
        path: "/specs/capability-21_test/feature-32_feat",
      },
    ];

    const output = formatMarkdown(await buildTree(workItems, statusResolver));

    expect(output).toMatch(/^# capability-21_test/m);
    expect(output).toMatch(/^## feature-32_feat/m);
  });

  it("GIVEN real tree from buildTree WHEN formatting as table THEN has header and capability row", async () => {
    const workItems: WorkItem[] = [
      { kind: WORK_ITEM_KINDS[0], number: 20, slug: "test", path: "/specs/capability-21_test" },
    ];

    const output = formatTable(await buildTree(workItems, statusResolver));

    expect(output).toContain("| Level");
    expect(output).toContain("| Capability");
    expect(output).toMatch(/\|\s*21\s*\|/);
  });

  it("GIVEN features added out of BSP order WHEN formatting as text THEN output preserves BSP order", async () => {
    const workItems: WorkItem[] = [
      { kind: WORK_ITEM_KINDS[0], number: 20, slug: "test", path: "/specs/capability-21_test" },
      {
        kind: WORK_ITEM_KINDS[1],
        number: 65,
        slug: "feat3",
        path: "/specs/capability-21_test/feature-65_feat3",
      },
      {
        kind: WORK_ITEM_KINDS[1],
        number: 32,
        slug: "feat1",
        path: "/specs/capability-21_test/feature-32_feat1",
      },
    ];

    const output = formatText(await buildTree(workItems, statusResolver));

    expect(output.indexOf("feature-32_feat1")).toBeLessThan(output.indexOf("feature-65_feat3"));
  });
});
