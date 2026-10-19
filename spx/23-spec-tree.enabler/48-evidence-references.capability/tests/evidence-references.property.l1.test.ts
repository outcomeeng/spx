import { describe, expect, it } from "vitest";

import { arbitraryEvidenceReferenceScenario } from "@testing/generators/spec-tree/evidence-references";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { readEvidenceSpecsFromMemory } from "@testing/harnesses/spec-tree/evidence-references";

describe("evidence references of generated node specs", () => {
  it("equal the tagged assertions in order of appearance, one each", async () => {
    await assertProperty(
      arbitraryEvidenceReferenceScenario(),
      async (scenario) => {
        const snapshot = await readEvidenceSpecsFromMemory([scenario]);

        expect(snapshot.allNodes.find(({ slug }) => slug === scenario.entry.slug)?.evidenceReferences).toEqual(
          scenario.expected,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
