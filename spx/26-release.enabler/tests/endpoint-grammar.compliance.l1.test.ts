import { arbitraryReleaseEndpointGrammarScenario } from "@testing/generators/release/product-context";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { readReleaseRangeContext } from "@testing/harnesses/release/product-context";
import { describe, expect, it } from "vitest";

describe("release product-context endpoint grammar compliance", () => {
  it("reads each endpoint's tree by the grammar its own committed declaration selects", async () => {
    const scenario = sampleGeneratedValue(arbitraryReleaseEndpointGrammarScenario());

    const context = await readReleaseRangeContext(scenario);

    const documentPaths = context.map((document) => document.path);
    expect(documentPaths).toEqual(expect.arrayContaining([...scenario.ownGrammarSpecificationPaths]));
  });

  it("reads no name only the other endpoint's grammar accepts as a valid node", async () => {
    const scenario = sampleGeneratedValue(arbitraryReleaseEndpointGrammarScenario());

    const context = await readReleaseRangeContext(scenario);

    const documentPaths = context.map((document) => document.path);
    expect(documentPaths).not.toContain(scenario.threeXNameAtFourZeroPath);
    expect(documentPaths).not.toContain(scenario.fourZeroNameAtThreeXPath);
  });
});
