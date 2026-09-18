import { RELEASE_NOTES_FAITHFULNESS_APPROVED } from "@/domains/release/release-notes";
import { RELEASE_NOTES_STANDARDS } from "@/domains/release/release-notes-standards";
import { arbitraryReleaseContextScenario } from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observeIndependentVersionSection } from "@testing/harnesses/release/keep-a-changelog-oracle";
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
