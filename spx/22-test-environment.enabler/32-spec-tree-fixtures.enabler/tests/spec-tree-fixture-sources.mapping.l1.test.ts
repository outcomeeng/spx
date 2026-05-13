import { describe, expect, it } from "vitest";

import type { SpecTreeProjectedNode, SpecTreeProjection } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

type NodeSignature = {
  readonly kind: string;
  readonly order: number;
  readonly slug: string;
  readonly childCount: number;
};

type DecisionSignature = {
  readonly kind: string;
  readonly order: number;
  readonly slug: string;
};

describe("withSpecTreeEnv source projections", () => {
  it("maps materialized filesystem fixtures to the same structure as the in-memory source", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await env.materialize();

      const memoryProjection = await env.projectMemory();
      const filesystemProjection = await env.projectFilesystem();

      expect(filesystemProjection.product?.title).toBe(memoryProjection.product?.title);
      expect(nodeSignatures(filesystemProjection)).toEqual(nodeSignatures(memoryProjection));
      expect(decisionSignatures(filesystemProjection)).toEqual(decisionSignatures(memoryProjection));
    });
  });
});

function nodeSignatures(projection: SpecTreeProjection): readonly NodeSignature[] {
  return flattenNodes(projection.nodes).map((node) => ({
    kind: node.kind,
    order: node.order,
    slug: node.slug,
    childCount: node.children.length,
  }));
}

function flattenNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}

function decisionSignatures(projection: SpecTreeProjection): readonly DecisionSignature[] {
  return projection.decisions.map((decision) => ({
    kind: decision.kind,
    order: decision.order,
    slug: decision.slug,
  }));
}
