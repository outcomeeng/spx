import { describe, expect, it } from "vitest";

import { readSpecTree } from "@/lib/spec-tree";
import { arbitraryDecisionAttachmentScenario } from "@testing/generators/spec-tree/decision-attachment";
import { createSource } from "@testing/generators/spec-tree/spec-tree";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("decision attachment", () => {
  it("attaches every parented decision to exactly its parent node and keeps every decision in the flat list", async () => {
    await assertProperty(
      arbitraryDecisionAttachmentScenario(),
      async (scenario) => {
        const snapshot = await readSpecTree({ source: createSource(scenario.entries) });

        expect(snapshot.decisions).toHaveLength(scenario.decisions.length);
        expect(new Set(snapshot.decisions.map(({ id }) => id))).toEqual(
          new Set(scenario.decisions.map(({ id }) => id)),
        );
        for (const decision of scenario.decisions) {
          expect(
            snapshot.allNodes
              .filter((node) => node.decisions.some(({ id }) => id === decision.id))
              .map(({ id }) => id),
          ).toEqual(decision.parentId === undefined ? [] : [decision.parentId]);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
