import { describe, expect, it } from "vitest";

import { arbitraryReleaseEndpointGrammarScenario } from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { readReleaseRangeContext } from "@testing/harnesses/release/product-context";

describe("release product-context endpoint grammar compliance", () => {
  it("reads each endpoint's tree by the grammar its own committed declaration selects", async () => {
    await assertProperty(
      arbitraryReleaseEndpointGrammarScenario(),
      async (scenario) => {
        const context = await readReleaseRangeContext(scenario);

        const documentPaths = context.map((document) => document.path);
        expect(documentPaths).toEqual(expect.arrayContaining([...scenario.ownGrammarSpecificationPaths]));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("reads no name only the other endpoint's grammar accepts as a valid node", async () => {
    await assertProperty(
      arbitraryReleaseEndpointGrammarScenario(),
      async (scenario) => {
        const context = await readReleaseRangeContext(scenario);

        const documentPaths = context.map((document) => document.path);
        expect(documentPaths).not.toContain(scenario.threeXNameAtFourZeroPath);
        expect(documentPaths).not.toContain(scenario.fourZeroNameAtThreeXPath);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
