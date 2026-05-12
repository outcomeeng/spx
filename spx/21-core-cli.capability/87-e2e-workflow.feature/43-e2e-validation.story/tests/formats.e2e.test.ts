import { OUTPUT_FORMAT } from "@/commands/spec/status";
import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { CLI_PATH } from "@testing/harnesses/constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { execa } from "execa";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("current spec-tree output formats", () => {
  it("renders text, JSON, markdown, and table formats for current spec-tree nodes", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeNode }) => {
      const nodeKind = sampleNodeKind(KIND_REGISTRY);
      const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const nodePath = formatNodePath(sampleSpecOrder(), nodeSlug, nodeKind);

      await writeNode(
        `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}/${nodeSlug}.md`,
        formatSpecHeading(),
      );

      const text = await runStatus(productDir);
      expect(text.stdout).toContain(KIND_REGISTRY[nodeKind].label);
      expect(text.stdout).toContain(nodePath);

      const json = await runStatus(productDir, "--json");
      const parsed = JSON.parse(json.stdout) as { nodes: Array<{ id: string; state: string }> };
      expect(parsed.nodes[0]).toMatchObject({
        id: nodePath,
        state: SPEC_TREE_NODE_STATE.DECLARED,
      });

      const markdown = await runStatus(productDir, "--format", OUTPUT_FORMAT.MARKDOWN);
      expect(markdown.stdout).toContain(`- ${KIND_REGISTRY[nodeKind].label}`);

      const table = await runStatus(productDir, "--format", OUTPUT_FORMAT.TABLE);
      expect(table.stdout).toContain("| Kind | Path | State |");
      expect(table.stdout).toContain(nodePath);
    });
  });
});

async function runStatus(
  cwd: string,
  ...args: readonly string[]
) {
  const result = await execa("node", [CLI_PATH, "spec", "status", ...args], { cwd });
  expect(result.exitCode).toBe(0);
  return result;
}

function sampleSpecOrder(): number {
  return sampleSpecTreeTestValue(fc.integer({ min: 10, max: 99 }));
}

function formatNodePath(order: number, slug: string, kind: keyof typeof KIND_REGISTRY): string {
  return `${order}-${slug}${KIND_REGISTRY[kind].suffix}`;
}

function formatSpecHeading(): string {
  return `# ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceTitle())}\n`;
}
