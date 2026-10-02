import { RELEASE_CONTEXT_KIND } from "@/domains/release/product-context";
import { arbitraryReleaseDecisionCitationScenario } from "@testing/generators/release/product-context";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { readReleaseEndpointContext } from "@testing/harnesses/release/product-context";
import { describe, expect, it } from "vitest";

describe("release product-context decision citation compliance", () => {
  it("binds every decision a selected document cites through a tree-absolute or node-local link", async () => {
    const scenario = sampleGeneratedValue(arbitraryReleaseDecisionCitationScenario());

    const context = await readReleaseEndpointContext(scenario);

    const decisionPaths = context
      .filter((document) => document.kind === RELEASE_CONTEXT_KIND.DECISION)
      .map((document) => document.path);
    expect(decisionPaths).toEqual(expect.arrayContaining([...scenario.linkCitedDecisionPaths]));
  });

  it("binds no decision named as bare text, named in an inline code span, linked through a climbing path, or absent from the committed endpoint", async () => {
    const scenario = sampleGeneratedValue(arbitraryReleaseDecisionCitationScenario());

    const context = await readReleaseEndpointContext(scenario);

    const decisionPaths = context
      .filter((document) => document.kind === RELEASE_CONTEXT_KIND.DECISION)
      .map((document) => document.path);
    expect(decisionPaths.filter((path) => scenario.textNamedDecisionPaths.includes(path))).toEqual([]);
    expect(decisionPaths.filter((path) => scenario.climbingLinkedDecisionPaths.includes(path))).toEqual([]);
    expect(decisionPaths.filter((path) => scenario.untrackedDecisionPaths.includes(path))).toEqual([]);
  });
});
