import { describe, expect, it } from "vitest";

import { projectSpecTree, readSpecTree, SPEC_TREE_PROJECTION } from "@/spec-tree";
import { KIND_REGISTRY } from "@/spec/config";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree";

describe("spec-tree projection contract", () => {
  it("conforms to the stable projection shape consumed by commands and automation", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource(fixture.entries),
    });

    const projection = projectSpecTree(snapshot);
    const root = projection.nodes.find((node) => node.id === fixture.root.id);
    const decision = projection.decisions.find((entry) => entry.id === fixture.decision.id);

    expect(Object.keys(projection).sort()).toEqual(Object.values(SPEC_TREE_PROJECTION.KEYS).sort());
    expect(Object.keys(root ?? {}).sort()).toEqual(Object.values(SPEC_TREE_PROJECTION.NODE_KEYS).sort());
    expect(Object.keys(decision ?? {}).sort()).toEqual(Object.values(SPEC_TREE_PROJECTION.DECISION_KEYS).sort());
    expect(projection.version).toBe(SPEC_TREE_PROJECTION.VERSION);
    expect(projection.product?.id).toBe(fixture.product.id);
    expect(root?.id).toBe(fixture.root.id);
    expect(decision?.id).toBe(fixture.decision.id);
  });
});
