import { RELEASE_NOTES_FAITHFULNESS_APPROVED } from "@/domains/release/release-notes";
import { RELEASE_NOTES_STANDARDS } from "@/domains/release/release-notes-standards";
import {
  arbitraryReleaseContextScenario,
  arbitraryReleaseEndpointSourceScenario,
  RELEASE_ENDPOINT_OWNERSHIP_CASE,
} from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observeIndependentVersionSection } from "@testing/harnesses/release/keep-a-changelog-oracle";
import { observeReleaseEndpointSources, RELEASE_ENDPOINT_COMMAND } from "@testing/harnesses/release/product-context";
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
  "resolves generated %s ownership topologies across in-memory release endpoints",
  async (kind) => {
    await assertProperty(
      arbitraryReleaseEndpointSourceScenario(kind),
      async (scenario) => {
        const observation = await observeReleaseEndpointSources(scenario, RELEASE_ENDPOINT_COMMAND.RELEASE_NOTES);
        const contextPaths = observation.context.map(({ path }) => path);
        if (scenario.kind === RELEASE_ENDPOINT_OWNERSHIP_CASE.UNRESOLVED) {
          expect(observation.error).toBeInstanceOf(Error);
          expect((observation.error as Error).message).toContain(scenario.changedSourcePath);
          expect(observation.producerInvocations).toBe(0);
          expect(observation.auditorInvocations).toBe(0);
        } else {
          expect(observation.error).toBeUndefined();
          expect(contextPaths).toEqual(expect.arrayContaining([...scenario.expectedContextPaths]));
        }
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  },
);
