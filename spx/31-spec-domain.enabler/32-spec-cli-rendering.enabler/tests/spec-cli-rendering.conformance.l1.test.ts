import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, renderSpecStatus } from "@/commands/spec/status";
import {
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_NODE_STATE,
  SPEC_TREE_PROJECTION,
} from "@/lib/spec-tree";
import {
  createSource,
  sampleNodeKind,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

describe("spec status JSON rendering", () => {
  it("conforms to the stable spec-tree projection contract for filesystem-domain node ids", async () => {
    const nodeKind = sampleNodeKind(KIND_REGISTRY);
    const nodeOrder = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.filesystemOrder());
    const nodeSlug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const nodeId = `${nodeOrder}-${nodeSlug}${KIND_REGISTRY[nodeKind].suffix}`;
    const projection = projectSpecTree(
      await readSpecTree({
        source: createSource([
          {
            type: SPEC_TREE_ENTRY_TYPE.NODE,
            id: nodeId,
            kind: nodeKind,
            order: nodeOrder,
            slug: nodeSlug,
          },
        ]),
      }),
    );
    const output = renderSpecStatus(
      projection,
      OUTPUT_FORMAT.JSON,
    );

    const parsed = JSON.parse(output) as {
      readonly version: number;
      readonly nodes: ReadonlyArray<{ readonly id: string; readonly state: string }>;
    };
    const node = expectPresent(parsed.nodes[0]);

    expect(parsed.version).toBe(SPEC_TREE_PROJECTION.VERSION);
    expect(node).toMatchObject({
      id: nodeId,
      state: SPEC_TREE_NODE_STATE.DECLARED,
    });
  });
});
