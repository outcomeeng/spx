import { describe, expect, it } from "vitest";

import { arbitraryReleaseEndpointDeclarationScenario } from "@testing/generators/release/endpoint-declaration";
import { arbitraryReleaseEndpointGrammarScenario } from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeReleaseCommandOverEndpoints } from "@testing/harnesses/release/endpoint-declaration";
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

  it("fails with a diagnostic naming the endpoint that commits an spx tree and no methodology version, before any agent invocation", async () => {
    await assertProperty(
      arbitraryReleaseEndpointDeclarationScenario(),
      async (scenario) => {
        const observation = await observeReleaseCommandOverEndpoints(scenario.undeclared);

        expect(observation.error).toEqual(
          expect.objectContaining({ message: expect.stringContaining(scenario.undeclared.undeclaredRef) }),
        );
        expect(observation.producerInvocations).toBe(0);
        expect(observation.auditorInvocations).toBe(0);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("fails no release whose endpoints each commit a methodology version", async () => {
    await assertProperty(
      arbitraryReleaseEndpointDeclarationScenario(),
      async (scenario) => {
        await expect(readReleaseRangeContext(scenario.conforming)).resolves.toBeDefined();
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
