import { hostedReleaseFor, packagePublicationMatches } from "@/domains/release/publication";
import { ReleaseNotesError, validatedReleaseNotesSection } from "@/domains/release/release-notes";
import { releasePublicationWorkflowViolations } from "@/interfaces/cli/release-publication-workflow";
import {
  arbitraryPublicationIdentityMismatchScenario,
  arbitraryPublicationRetryScenario,
  arbitraryPublicationScenario,
  arbitraryPublicationSectionValidationScenario,
  arbitraryPublicationWorkflowViolation,
} from "@testing/generators/release/publication";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observePublication } from "@testing/harnesses/release/publication";
import { observeReleasePublicationWorkflow } from "@testing/harnesses/release/publication-workflow";
import { describe, expect, it } from "vitest";

describe("release publication compliance", () => {
  it("accepts only the exact verified package publication identity", () => {
    assertProperty(
      arbitraryPublicationRetryScenario(),
      (scenario) => {
        expect(
          packagePublicationMatches(scenario.packagePublication, scenario.existingPackage),
        ).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
    assertProperty(
      arbitraryPublicationIdentityMismatchScenario(),
      (scenario) => {
        expect(
          packagePublicationMatches(scenario.packagePublication, scenario.existingPackage),
        ).toBe(false);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("extracts one exact validated release section and rejects absent or duplicate sections", () => {
    assertProperty(
      arbitraryPublicationSectionValidationScenario(),
      (scenario) => {
        expect(validatedReleaseNotesSection(scenario.validChangelog, scenario.version)).toBe(
          scenario.expectedSection,
        );
        expect(validatedReleaseNotesSection(scenario.footerChangelog, scenario.version)).toBe(
          scenario.footerExpectedSection,
        );
        expect(() => validatedReleaseNotesSection(scenario.validChangelog, scenario.absentVersion)).toThrow(
          ReleaseNotesError,
        );
        expect(() => validatedReleaseNotesSection(scenario.duplicateChangelog, scenario.version)).toThrow(
          ReleaseNotesError,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("derives hosted release content from verified release inputs", () => {
    assertProperty(
      arbitraryPublicationScenario(),
      (scenario) => {
        expect(
          hostedReleaseFor(
            scenario.tag,
            scenario.taggedCommit,
            scenario.expectedHostedRelease.body,
          ),
        ).toEqual(scenario.expectedHostedRelease);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("reconciles the hosted release only after package publication is confirmed", async () => {
    await assertProperty(
      arbitraryPublicationScenario(),
      async (scenario) => {
        const observation = await observePublication(scenario);
        const packageRequest = observation.packagePublishRequests.at(0);
        const hostedRequest = observation.hostedReleaseRequests.at(0);
        expect([packageRequest?.sequence, hostedRequest?.sequence]).toSatisfy(
          ([packageSequence, hostedSequence]) =>
            packageSequence !== undefined
            && hostedSequence !== undefined
            && packageSequence < hostedSequence,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("detects every publication workflow authority or ordering violation", async () => {
    const workflow = await observeReleasePublicationWorkflow();
    expect(releasePublicationWorkflowViolations(workflow)).toEqual([]);
    assertProperty(
      arbitraryPublicationWorkflowViolation(workflow),
      ({ snapshot, expectedViolation }) => {
        expect(releasePublicationWorkflowViolations(snapshot)).toContain(expectedViolation);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
