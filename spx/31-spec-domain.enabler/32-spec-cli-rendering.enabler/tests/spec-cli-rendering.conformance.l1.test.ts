import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, statusCommand } from "@/commands/spec/status";
import { SPEC_TREE_ENTRY_TYPE, SPEC_TREE_NODE_STATE, SPEC_TREE_PROJECTION } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import {
  createSource,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

describe("spec status JSON rendering", () => {
  it("conforms to the stable spec-tree projection contract", async () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const nodeOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceOrder());
    const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const nodeId = `${nodeOrder}-${nodeSlug}${KIND_REGISTRY[nodeKind].suffix}`;

    const output = await statusCommand({
      format: OUTPUT_FORMAT.JSON,
      source: createSource([
        {
          type: SPEC_TREE_ENTRY_TYPE.NODE,
          id: nodeId,
          kind: nodeKind,
          order: nodeOrder,
          slug: nodeSlug,
        },
      ]),
    });

    const parsed = JSON.parse(output) as {
      readonly version: string;
      readonly nodes: ReadonlyArray<{ readonly id: string; readonly state: string }>;
    };

    expect(parsed.version).toBe(SPEC_TREE_PROJECTION.VERSION);
    expect(parsed.nodes[0]).toMatchObject({
      id: nodeId,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    });
  });
});
