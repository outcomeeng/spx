import { RELEASE_NOTES_FAITHFULNESS_APPROVED } from "@/domains/release/release-notes";
import { RELEASE_NOTES_STANDARDS } from "@/domains/release/release-notes-standards";
import { KIND_REGISTRY } from "@/lib/spec-tree";
import {
  arbitraryReleaseContextScenario,
  arbitraryReleaseEndpointRepositoryScenario,
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
  sampleReleaseOwnershipFixture,
} from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observeIndependentVersionSection } from "@testing/harnesses/release/keep-a-changelog-oracle";
import { observeReleaseEndpointRepository } from "@testing/harnesses/release/product-context";
import { observeReleaseNotesContextTransport } from "@testing/harnesses/release/release-notes-compliance";
import { expect, it } from "vitest";

it("preserves identical complete release inputs for the producer and auditor", async () => {
  await assertProperty(
    arbitraryReleaseContextScenario(),
    async (scenario) => {
      const observation = await observeReleaseNotesContextTransport(
        scenario,
        async () => RELEASE_NOTES_FAITHFULNESS_APPROVED,
      );
      for (const input of [observation.producerSource, observation.auditorSource]) {
        expect(input).toEqual({ productContext: scenario.documents, releaseData: scenario.releaseData });
      }
      for (const prompt of [observation.producerPrompt, observation.auditPrompt]) {
        expect(prompt).toContain(RELEASE_NOTES_STANDARDS);
      }
      expect(observation.stagedPromptPath).toBe(observation.stagedCanonicalPath);
      expect(observation.stagedInput).toBe(scenario.existingNotes);
      expect(observation.auditedSection).toBe(
        observeIndependentVersionSection(observation.generatedNotes, scenario.releaseData.version),
      );
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
              nodeSpecPath(20, scenario.earlierNodeSlug),
              nodeSpecPath(30, scenario.laterNodeSlug),
            ]));
            break;
          case RELEASE_ENDPOINT_OWNERSHIP_CASE.MULTIPLE_CANDIDATES: {
            const parent = nodeDirectoryPath(20, scenario.parentNodeSlug);
            expect(contextPaths).toEqual(expect.arrayContaining([
              posix.join(parent, `${scenario.parentNodeSlug}.md`),
              nodeSpecPath(20, scenario.childNodeSlug, parent),
              nodeSpecPath(30, scenario.peerNodeSlug, parent),
            ]));
            break;
          }
          case RELEASE_ENDPOINT_OWNERSHIP_CASE.DELETED:
            expect(contextPaths).toContain(nodeSpecPath(20, scenario.earlierNodeSlug));
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

function nodeDirectoryPath(index: number, slug: string, parent = "spx"): string {
  return posix.join(parent, `${index}-${slug}${KIND_REGISTRY.enabler.suffix}`);
}

function nodeSpecPath(index: number, slug: string, parent?: string): string {
  return posix.join(nodeDirectoryPath(index, slug, parent), `${slug}.md`);
}
import { posix } from "node:path";
