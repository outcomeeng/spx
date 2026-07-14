import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, projectSpecTree, readSpecTree, SPEC_TREE_PROJECTION } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";
import { expectPresent } from "@testing/harnesses/spec-tree/assertions";

describe("spec-tree projection contract", () => {
  it("conforms to the stable projection shape consumed by commands and automation", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({
      source: createSource(fixture.entries),
    });

    const projection = projectSpecTree(snapshot);
    const root = expectPresent(projection.nodes.find((node) => node.id === fixture.root.id));
    const decision = expectPresent(projection.decisions.find((entry) => entry.id === fixture.decision.id));
    const product = expectPresent(projection.product);

    expect(Object.keys(projection).sort(compareAsciiStrings)).toEqual(
      Object.values(SPEC_TREE_PROJECTION.KEYS).sort(compareAsciiStrings),
    );
    expect(Object.keys(root).sort(compareAsciiStrings)).toEqual(
      Object.values(SPEC_TREE_PROJECTION.NODE_KEYS).sort(compareAsciiStrings),
    );
    expect(Object.keys(decision).sort(compareAsciiStrings)).toEqual(
      Object.values(SPEC_TREE_PROJECTION.DECISION_KEYS).sort(compareAsciiStrings),
    );
    expect(projection.version).toBe(SPEC_TREE_PROJECTION.VERSION);
    expect(product.id).toBe(fixture.product.id);
    expect(root.id).toBe(fixture.root.id);
    expect(decision.id).toBe(fixture.decision.id);
  });
});
