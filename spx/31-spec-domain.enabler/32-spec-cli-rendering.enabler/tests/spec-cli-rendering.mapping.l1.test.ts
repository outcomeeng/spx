import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, SPEC_STATUS_TABLE_HEADER, statusCommand } from "@/commands/spec/status";
import { SPEC_TREE_ENTRY_TYPE, SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import {
  createSource,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

describe("spec status rendering", () => {
  it("maps spec-tree projections to text, table, and markdown output", async () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const nodeOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceOrder());
    const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const nodeId = `${nodeOrder}-${nodeSlug}${KIND_REGISTRY[nodeKind].suffix}`;
    const source = createSource([
      {
        type: SPEC_TREE_ENTRY_TYPE.NODE,
        id: nodeId,
        kind: nodeKind,
        order: nodeOrder,
        slug: nodeSlug,
      },
    ]);

    const text = await statusCommand({ source });
    const table = await statusCommand({ source, format: OUTPUT_FORMAT.TABLE });
    const markdown = await statusCommand({ source, format: OUTPUT_FORMAT.MARKDOWN });

    expect(text).toContain(KIND_REGISTRY[nodeKind].label);
    expect(text).toContain(nodeId);
    expect(text).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    expect(table).toContain(SPEC_STATUS_TABLE_HEADER);
    expect(table).toContain(nodeId);
    expect(markdown).toContain(`- ${KIND_REGISTRY[nodeKind].label}`);
    expect(markdown).toContain(nodeId);
  });
});
