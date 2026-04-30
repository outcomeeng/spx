import { describe, expect, it } from "vitest";

import { readSpecTree, SPEC_TREE_ENTRY_TYPE } from "@/spec-tree";
import { KIND_REGISTRY } from "@/spec/config";
import { buildRepresentativeFixture, createSource, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree";

describe("spec-tree fixture generator", () => {
  it("generates representative entries accepted by readSpecTree", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const snapshot = await readSpecTree({ source: createSource(fixture.entries) });

    expect(fixture.product.type).toBe(SPEC_TREE_ENTRY_TYPE.PRODUCT);
    expect(fixture.root.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
    expect(fixture.child.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
    expect(fixture.peer.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
    expect(fixture.decision.type).toBe(SPEC_TREE_ENTRY_TYPE.DECISION);
    expect(fixture.childEvidence.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
    expect(fixture.peerEvidence.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
    expect(snapshot.allNodes.map((node) => node.id)).toContain(fixture.root.id);
  });

  it("receives kind vocabulary through the injected registry", () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const generatedKinds = [
      fixture.root.kind,
      fixture.child.kind,
      fixture.peer.kind,
      fixture.decision.kind,
    ];

    for (const kind of generatedKinds) {
      expect(Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind)).toBe(true);
    }
    expect(SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY)).toBeDefined();
  });
});
