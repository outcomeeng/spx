import { SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import {
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { CLI_PATH, CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { execa } from "execa";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("current spec-tree CLI workflow", () => {
  it("reads a generated current spec-tree fixture through the compiled CLI", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir, writeNode }) => {
      const nodeKind = sampleNodeKind(KIND_REGISTRY);
      const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
      const nodePath = formatNodePath(sampleSpecOrder(), nodeSlug, nodeKind);

      await writeNode(
        `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}/${nodeSlug}.md`,
        formatSpecHeading(),
      );

      const { stdout, exitCode } = await execa("node", [CLI_PATH, "spec", "status", "--json"], {
        cwd: productDir,
      });

      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout) as { nodes: Array<{ id: string; state: string }> };
      expect(result.nodes[0]).toMatchObject({
        id: nodePath,
        state: SPEC_TREE_NODE_STATE.DECLARED,
      });
    });
  });

  it("keeps current spec-tree status inspection within the CLI E2E threshold", async () => {
    await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async ({ productDir }) => {
      const startTime = Date.now();
      const { exitCode } = await execa("node", [CLI_PATH, "spec", "status"], {
        cwd: productDir,
      });
      const elapsed = Date.now() - startTime;

      expect(exitCode).toBe(0);
      expect(elapsed).toBeLessThan(CLI_TIMEOUTS_MS.E2E);
    });
  });
});

function sampleSpecOrder(): number {
  return sampleSpecTreeTestValue(fc.integer({ min: 10, max: 99 }));
}

function formatNodePath(order: number, slug: string, kind: keyof typeof KIND_REGISTRY): string {
  return `${order}-${slug}${KIND_REGISTRY[kind].suffix}`;
}

function formatSpecHeading(): string {
  return `# ${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceTitle())}\n`;
}
