import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, projectSpecTree, readSpecTree, SPEC_TREE_PROJECTION } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  arbitraryUnregisteredProjectionKey,
  projectionKeyViolations,
} from "@testing/generators/spec-tree/projection-contract";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";
import { SPEC_TREE_PROJECTION_CONTRACT } from "@testing/harnesses/spec-tree/projection-contract";

async function projectRepresentativeTree() {
  const fixture = buildRepresentativeFixture(KIND_REGISTRY);
  const snapshot = await readSpecTree({
    source: createSource(fixture.entries),
  });
  return { fixture, projection: projectSpecTree(snapshot) };
}

describe("spec-tree projection contract", () => {
  it("conforms to the stable projection shape consumed by commands and automation", async () => {
    const { fixture, projection } = await projectRepresentativeTree();
    const root = projection.nodes.find((node) => node.id === fixture.root.id);
    const decision = projection.decisions.find((entry) => entry.id === fixture.decision.id);
    const product = projection.product;

    expect(root).toBeDefined();
    expect(decision).toBeDefined();
    expect(product).not.toBeNull();
    if (root === undefined || decision === undefined || product === null) return;

    const contract = SPEC_TREE_PROJECTION_CONTRACT.safeParse(projection);
    expect(contract.error?.issues ?? []).toEqual([]);
    expect(contract.success).toBe(true);

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

  it("rejects a projection carrying a key the registry does not name or lacking one it does", async () => {
    const { projection } = await projectRepresentativeTree();
    const violations = projectionKeyViolations(projection, sampleGeneratedValue(arbitraryUnregisteredProjectionKey()));

    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraDocumentKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.missingDocumentKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraNodeKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraDecisionKey).success).toBe(false);
    expect(SPEC_TREE_PROJECTION_CONTRACT.safeParse(violations.extraProductKey).success).toBe(false);
  });
});
