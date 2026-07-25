import { hostedReleaseFor, PACKAGE_PROVENANCE, packagePublicationMatches } from "@/domains/release/publication";
import { ReleaseNotesError, validatedReleaseNotesSection } from "@/domains/release/release-notes";
import { releasePublicationWorkflowViolations } from "@/interfaces/cli/release-publication-workflow";
import { GITHUB_RELEASE } from "@/lib/release-publication/github-release-publisher";
import { NPM_PUBLICATION } from "@/lib/release-publication/npm-package-publisher";
import {
  arbitraryPublicationIdentityMismatchScenario,
  arbitraryPublicationRetryScenario,
  arbitraryPublicationScenario,
  arbitraryPublicationSectionValidationScenario,
  arbitraryPublicationWorkflowViolation,
} from "@testing/generators/release/publication";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observePublication } from "@testing/harnesses/release/publication";
import {
  observeGithubReleasePublisher,
  observeNpmPackagePublisher,
} from "@testing/harnesses/release/publication-adapters";
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

  it("maps npm package metadata and publishes with trusted provenance flags", async () => {
    await assertProperty(
      arbitraryPublicationScenario(),
      async (scenario) => {
        const observation = await observeNpmPackagePublisher(scenario);
        expect(observation.inspected).toEqual(scenario.packagePublication);
        expect(observation.unverified).toEqual({
          ...scenario.packagePublication,
          provenance: PACKAGE_PROVENANCE.UNVERIFIED,
        });
        expect(observation.missing).toBeNull();
        [
          observation.inspectRequests,
          observation.unverifiedRequests,
          observation.missingRequests,
        ].forEach((requests) => {
          expect(requests).toEqual([{
            command: NPM_PUBLICATION.EXECUTABLE,
            args: [
              NPM_PUBLICATION.VIEW,
              `${scenario.packagePublication.name}@${scenario.packagePublication.version}`,
              NPM_PUBLICATION.JSON,
            ],
            options: { cwd: scenario.productDir },
          }]);
        });
        expect(observation.publishRequests).toEqual([{
          command: NPM_PUBLICATION.EXECUTABLE,
          args: [
            NPM_PUBLICATION.PUBLISH,
            NPM_PUBLICATION.PROVENANCE,
            NPM_PUBLICATION.ACCESS,
            NPM_PUBLICATION.PUBLIC,
            NPM_PUBLICATION.IGNORE_SCRIPTS,
          ],
          options: { cwd: scenario.productDir },
        }]);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("creates, updates, or preserves the GitHub Release from verified inputs", async () => {
    await assertProperty(
      arbitraryPublicationRetryScenario(),
      async (scenario) => {
        const observation = await observeGithubReleasePublisher(scenario);
        [
          observation.exactRequests.at(0),
          observation.missingRequests.at(0),
          observation.staleRequests.at(0),
        ].forEach((request) => {
          expect(request).toEqual({
            command: GITHUB_RELEASE.EXECUTABLE,
            args: [
              GITHUB_RELEASE.RELEASE,
              GITHUB_RELEASE.VIEW,
              scenario.tag,
              GITHUB_RELEASE.JSON,
              GITHUB_RELEASE.JSON_FIELDS,
            ],
            options: { cwd: scenario.productDir },
          });
        });
        expect(observation.missingRequests.slice(1)).toEqual([{
          command: GITHUB_RELEASE.EXECUTABLE,
          args: [
            GITHUB_RELEASE.RELEASE,
            GITHUB_RELEASE.CREATE,
            scenario.tag,
            GITHUB_RELEASE.TITLE,
            scenario.expectedHostedRelease.title,
            GITHUB_RELEASE.TARGET,
            scenario.taggedCommit,
            GITHUB_RELEASE.NOTES_FILE,
            GITHUB_RELEASE.STDIN_FILE,
            GITHUB_RELEASE.VERIFY_TAG,
          ],
          options: { cwd: scenario.productDir, input: scenario.expectedHostedRelease.body },
        }]);
        expect(observation.staleRequests.slice(1)).toEqual([{
          command: GITHUB_RELEASE.EXECUTABLE,
          args: [
            GITHUB_RELEASE.RELEASE,
            GITHUB_RELEASE.EDIT,
            scenario.tag,
            GITHUB_RELEASE.TITLE,
            scenario.expectedHostedRelease.title,
            GITHUB_RELEASE.TARGET,
            scenario.taggedCommit,
            GITHUB_RELEASE.NOTES_FILE,
            GITHUB_RELEASE.STDIN_FILE,
          ],
          options: { cwd: scenario.productDir, input: scenario.expectedHostedRelease.body },
        }]);
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
