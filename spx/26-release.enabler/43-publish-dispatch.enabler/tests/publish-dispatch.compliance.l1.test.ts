import {
  committedChangelogTreePath,
  hostedReleaseFor,
  PACKAGE_PROVENANCE,
  packagePublicationMatches,
  PUBLICATION_CONFIRMATION_BACKOFF_MS,
  ReleasePublicationError,
} from "@/domains/release/publication";
import { releasePublicationWorkflowViolations } from "@/domains/release/publication-workflow";
import { ReleaseNotesError, validatedReleaseNotesSection } from "@/domains/release/release-notes";
import { RELEASE_PUBLISH_INVOCATION } from "@/interfaces/cli/release";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { GITHUB_RELEASE } from "@/lib/release-publication/github-release-publisher";
import { NPM_PUBLICATION } from "@/lib/release-publication/npm-package-publisher";
import {
  arbitraryPublicationChangelogPathScenario,
  arbitraryPublicationCheckoutMismatchScenario,
  arbitraryPublicationCommandExitCode,
  arbitraryPublicationConfirmationFailureScenario,
  arbitraryPublicationIdentityMismatchScenario,
  arbitraryPublicationPostPublishIdentityScenario,
  arbitraryPublicationProvenanceLagScenario,
  arbitraryPublicationRetryScenario,
  arbitraryPublicationScenario,
  arbitraryPublicationSectionValidationScenario,
  arbitraryPublicationWorkflowViolation,
} from "@testing/generators/release/publication";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { observeIndependentVersionSection } from "@testing/harnesses/release/keep-a-changelog-oracle";
import {
  createPublicationHarness,
  createPublishReleaseCommandHarness,
  observeConfirmationRetry,
  observePublication,
} from "@testing/harnesses/release/publication";
import {
  observeGithubReleasePublisher,
  observeNpmPackagePublisher,
  runAbsentPublicationExecutable,
  runExitingPublicationCommand,
  runSignalTerminatedPublicationCommand,
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
        Object.values(scenario.identityMismatches).forEach((mismatch) => {
          expect(packagePublicationMatches(scenario.packagePublication, mismatch)).toBe(false);
        });
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
          observeIndependentVersionSection(scenario.validChangelog, scenario.version),
        );
        expect(validatedReleaseNotesSection(scenario.footerChangelog, scenario.version)).toBe(
          observeIndependentVersionSection(scenario.footerChangelog, scenario.version),
        );
        expect(
          observeIndependentVersionSection(scenario.validChangelog, scenario.absentVersion),
        ).toBeUndefined();
        expect(() => validatedReleaseNotesSection(scenario.validChangelog, scenario.absentVersion)).toThrow(
          ReleaseNotesError,
        );
        expect(
          observeIndependentVersionSection(scenario.duplicateChangelog, scenario.version),
        ).toBeUndefined();
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

  it("reads past a fresh publication whose provenance the registry has yet to expose", async () => {
    await assertProperty(
      arbitraryPublicationProvenanceLagScenario(),
      async (scenario) => {
        const observation = await observeConfirmationRetry(scenario);
        expect(observation.error).toBeUndefined();
        expect(observation.packagePublishRequests).toHaveLength(1);
        expect(observation.waits).toEqual(
          PUBLICATION_CONFIRMATION_BACKOFF_MS.slice(0, scenario.lateReads),
        );
        expect(observation.hostedReleaseRequests.map((request) => request.value)).toEqual([
          scenario.expectedHostedRelease,
        ]);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("fails a fresh publication whose registry record names another release without waiting", async () => {
    await assertProperty(
      arbitraryPublicationPostPublishIdentityScenario(),
      async (scenario) => {
        const observation = await observeConfirmationRetry(scenario);
        expect(observation.error).toBeInstanceOf(ReleasePublicationError);
        expect(observation.waits).toEqual([]);
        expect(observation.hostedReleaseRequests).toEqual([]);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("withholds the hosted release when the published package is not confirmed with verified provenance", async () => {
    await assertProperty(
      arbitraryPublicationConfirmationFailureScenario(),
      async (scenario) => {
        const harness = createPublicationHarness(scenario);
        await expect(harness.publish()).rejects.toBeInstanceOf(ReleasePublicationError);
        const observation = harness.observe();
        expect(observation.packagePublishRequests.map((request) => request.value)).toEqual([
          scenario.packagePublication,
        ]);
        expect(observation.hostedReleaseRequests).toEqual([]);
        expect(observation.hostedReleaseState).toEqual(scenario.existingHostedRelease);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("withholds every registry and repository-host request from a checkout whose head is not the tagged commit", async () => {
    await assertProperty(
      arbitraryPublicationCheckoutMismatchScenario(),
      async (scenario) => {
        const harness = createPublicationHarness(scenario);
        await expect(harness.publish()).rejects.toBeInstanceOf(ReleasePublicationError);
        const observation = harness.observe();
        expect(observation.packageInspectRequests).toEqual([]);
        expect(observation.packagePublishRequests).toEqual([]);
        expect(observation.hostedReleaseRequests).toEqual([]);
        expect(observation.packageState).toEqual(scenario.existingPackage);
        expect(observation.hostedReleaseState).toEqual(scenario.existingHostedRelease);

        const commandHarness = createPublishReleaseCommandHarness(scenario);
        await expect(commandHarness.publish()).rejects.toBeInstanceOf(ReleasePublicationError);
        const commandObservation = commandHarness.observe();
        expect(commandObservation.commitRequests.map((request) => request.ref)).toContain(GIT_ROOT_COMMAND.HEAD);
        expect(commandObservation.packageInspectRequests).toEqual([]);
        expect(commandObservation.packagePublishRequests).toEqual([]);
        expect(commandObservation.hostedReleaseRequests).toEqual([]);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("fails a publication command that cannot be spawned or is terminated by a signal", async () => {
    await expect(runAbsentPublicationExecutable()).rejects.toBeInstanceOf(ReleasePublicationError);
    await expect(runSignalTerminatedPublicationCommand()).rejects.toBeInstanceOf(ReleasePublicationError);
    await assertProperty(
      arbitraryPublicationCommandExitCode(),
      async (exitCode) => {
        expect((await runExitingPublicationCommand(exitCode)).exitCode).toBe(exitCode);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("rejects a configured changelog path that escapes or names the product directory", () => {
    assertProperty(
      arbitraryPublicationChangelogPathScenario(),
      (scenario) => {
        expect(committedChangelogTreePath(scenario.productDir, scenario.containedPath)).toBe(scenario.containedPath);
        expect(() => committedChangelogTreePath(scenario.productDir, scenario.escapingPath)).toThrow(
          ReleasePublicationError,
        );
        expect(() => committedChangelogTreePath(scenario.productDir, scenario.rootResolvingPath)).toThrow(
          ReleasePublicationError,
        );
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("detects every publication workflow authority or ordering violation", async () => {
    const workflow = await observeReleasePublicationWorkflow();
    expect(releasePublicationWorkflowViolations(workflow, RELEASE_PUBLISH_INVOCATION)).toEqual([]);
    assertProperty(
      arbitraryPublicationWorkflowViolation(workflow),
      ({ snapshot, expectedViolation }) => {
        expect(releasePublicationWorkflowViolations(snapshot, RELEASE_PUBLISH_INVOCATION)).toContain(expectedViolation);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
