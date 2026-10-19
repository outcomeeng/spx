import { describe, expect, it } from "vitest";

import { SPEC_TREE_PROJECTION, type SpecTreeProjectedNode } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryUnregisteredProjectionKey,
  projectionKeyViolations,
} from "@testing/generators/spec-tree/projection-contract";
import {
  observeRepresentativeProjection,
  SPEC_TREE_PROJECTION_CONTRACT,
} from "@testing/harnesses/spec-tree/projection-contract";

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort(compareAsciiStrings);
}

function sortedRegistryKeys(declared: Record<string, string>): string[] {
  return Object.values(declared).sort(compareAsciiStrings);
}

function withDescendants(nodes: readonly SpecTreeProjectedNode[]): SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...withDescendants(node.children)]);
}

describe("spec-tree projection contract", () => {
  it("conforms to the stable projection shape consumed by commands and automation", async () => {
    const { fixture, projection } = await observeRepresentativeProjection();
    const root = projection.nodes.find((node) => node.id === fixture.root.id);
    const decision = projection.decisions.find((entry) => entry.id === fixture.decision.id);

    expect(root).toBeDefined();
    expect(decision).toBeDefined();
    expect(projection.product?.id).toBe(fixture.product.id);

    const contract = SPEC_TREE_PROJECTION_CONTRACT.safeParse(projection);
    expect(contract.error?.issues ?? []).toEqual([]);
    expect(contract.success).toBe(true);

    expect(projection.version).toBe(SPEC_TREE_PROJECTION.VERSION);
    expect(root?.id).toBe(fixture.root.id);
    expect(decision?.id).toBe(fixture.decision.id);
  });

  it("emits exactly the registry's keys on the document, the product, and every node and decision", async () => {
    const { fixture, projection } = await observeRepresentativeProjection();
    const nodes = withDescendants(projection.nodes);

    expect(projection.product).not.toBeNull();
    expect(nodes.map((node) => node.id)).toContain(fixture.child.id);
    expect(projection.decisions.length).toBeGreaterThan(0);

    expect(sortedKeys(projection)).toEqual(sortedRegistryKeys(SPEC_TREE_PROJECTION.KEYS));
    expect(sortedKeys(projection.product ?? {})).toEqual(sortedRegistryKeys(SPEC_TREE_PROJECTION.PRODUCT_KEYS));
    for (const node of nodes) {
      expect(sortedKeys(node)).toEqual(sortedRegistryKeys(SPEC_TREE_PROJECTION.NODE_KEYS));
    }
    for (const decision of projection.decisions) {
      expect(sortedKeys(decision)).toEqual(sortedRegistryKeys(SPEC_TREE_PROJECTION.DECISION_KEYS));
    }
  });

  it("rejects a projection carrying a key the registry does not name or lacking one it does", async () => {
    const { projection } = await observeRepresentativeProjection();
    const violations = projectionKeyViolations(projection, sampleGeneratedValue(arbitraryUnregisteredProjectionKey()));

    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraDocumentKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.missingDocumentKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraNodeKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraDecisionKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraProductKey).success).toBe(false);
  });
});
