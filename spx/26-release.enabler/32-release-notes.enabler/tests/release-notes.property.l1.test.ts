import { RELEASE_NOTES_STANDARDS } from "@/domains/release/release-notes-standards";
import { arbitraryReleaseContextScenario } from "@testing/generators/release/product-context";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
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
