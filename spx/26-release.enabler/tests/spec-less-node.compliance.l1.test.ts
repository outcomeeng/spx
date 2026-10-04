import { arbitraryReleaseDecisionCitationScenario } from "@testing/generators/release/product-context";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { readReleaseEndpointContext } from "@testing/harnesses/release/product-context";
import { describe, expect, it } from "vitest";

describe("release product-context spec-less node compliance", () => {
  it("reads the context of an endpoint carrying a node directory without a committed specification and takes no document from that directory", async () => {
    const scenario = sampleGeneratedValue(arbitraryReleaseDecisionCitationScenario());

    const context = await readReleaseEndpointContext(scenario);

    expect(context.length).toBeGreaterThan(0);
    expect(context.filter((document) => document.path.startsWith(`${scenario.specLessNodeDirectory}/`))).toEqual([]);
  });
});
