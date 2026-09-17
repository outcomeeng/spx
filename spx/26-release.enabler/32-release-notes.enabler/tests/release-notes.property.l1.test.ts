import { RELEASE_NOTES_STANDARDS } from "@/domains/release/release-notes-standards";
import { KIND_REGISTRY } from "@/lib/spec-tree";
import {
  arbitraryReleaseContextScenario,
  arbitraryReleaseEndpointRepositoryScenario,
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
  sampleReleaseOwnershipFixture,
} from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observeReleaseEndpointRepository } from "@testing/harnesses/release/product-context";
import { observeReleaseNotesContextTransport } from "@testing/harnesses/release/release-notes-compliance";
import { expect, it } from "vitest";

it("preserves identical complete release inputs for the producer and auditor", async () => {
  await assertProperty(
    arbitraryReleaseContextScenario(),
    async (scenario) => {
      const observation = await observeReleaseNotesContextTransport(scenario);
      for (const input of [observation.producerSource, observation.auditorSource]) {
        expect(input).toEqual({ productContext: scenario.documents, releaseData: scenario.releaseData });
      }
      for (const prompt of [observation.producerPrompt, observation.auditPrompt]) {
        expect(prompt).toContain(RELEASE_NOTES_STANDARDS);
      }
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
});

it.each(Object.values(RELEASE_ENDPOINT_OWNERSHIP_CASE))(
  "resolves generated %s ownership topologies across release endpoint repositories",
  async (kind) => {
    await assertProperty(
      arbitraryReleaseEndpointRepositoryScenario(kind),
      async (scenario) => {
        const observation = await observeReleaseEndpointRepository(scenario);
        const contextPaths = observation.context.map(({ path }) => path);
        switch (scenario.kind) {
          case RELEASE_ENDPOINT_OWNERSHIP_CASE.CROSS_ENDPOINT:
            expect(contextPaths).toEqual(expect.arrayContaining([
              `spx/20-${scenario.earlierNodeSlug}${KIND_REGISTRY.enabler.suffix}/${scenario.earlierNodeSlug}.md`,
              `spx/30-${scenario.laterNodeSlug}${KIND_REGISTRY.enabler.suffix}/${scenario.laterNodeSlug}.md`,
            ]));
            break;
          case RELEASE_ENDPOINT_OWNERSHIP_CASE.MULTIPLE_CANDIDATES: {
            const parent = `spx/20-${scenario.parentNodeSlug}${KIND_REGISTRY.enabler.suffix}`;
            expect(contextPaths).toEqual(expect.arrayContaining([
              `${parent}/${scenario.parentNodeSlug}.md`,
              `${parent}/20-${scenario.childNodeSlug}${KIND_REGISTRY.enabler.suffix}/${scenario.childNodeSlug}.md`,
              `${parent}/30-${scenario.peerNodeSlug}${KIND_REGISTRY.enabler.suffix}/${scenario.peerNodeSlug}.md`,
            ]));
            break;
          }
          case RELEASE_ENDPOINT_OWNERSHIP_CASE.DELETED:
            expect(contextPaths).toContain(
              `spx/20-${scenario.earlierNodeSlug}${KIND_REGISTRY.enabler.suffix}/${scenario.earlierNodeSlug}.md`,
            );
            break;
          case RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED:
            expect(observation.error).toBeInstanceOf(Error);
            expect((observation.error as Error).message).toContain(sampleReleaseOwnershipFixture().sourcePath);
            expect(observation.producerInvocations).toBe(0);
            expect(observation.auditorInvocations).toBe(0);
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  },
);
