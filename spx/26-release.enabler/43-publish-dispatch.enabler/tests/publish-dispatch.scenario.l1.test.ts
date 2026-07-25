import { type PackagePublication, ReleasePublicationError } from "@/domains/release/publication";
import {
  arbitraryPublicationIdentityMismatchScenario,
  arbitraryPublicationMissingHostedReleaseScenario,
  arbitraryPublicationRetryScenario,
  arbitraryPublicationScenario,
  arbitraryPublicationTagMismatchScenario,
} from "@testing/generators/release/publication";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import {
  type FailedPublicationObservation,
  observeFailedPublication,
  observePublication,
  type PublicationObservation,
} from "@testing/harnesses/release/publication";
import { describe, expect, it } from "vitest";

describe("release publication dispatch", () => {
  it("rejects a release tag that does not name the package version", async () => {
    await expect(
      observeFailedPublication(sampleReleaseTestValue(arbitraryPublicationTagMismatchScenario())),
    ).resolves.toSatisfy((observation: FailedPublicationObservation) => {
      expect(observation.error).toBeInstanceOf(ReleasePublicationError);
      expect(observation.packageInspectRequests).toEqual([]);
      expect(observation.packagePublishRequests).toEqual([]);
      expect(observation.hostedReleaseRequests).toEqual([]);
      return true;
    });
  });

  it("publishes the package before exposing the hosted release", async () => {
    await expect(
      observePublication(sampleReleaseTestValue(arbitraryPublicationScenario())),
    ).resolves.toSatisfy((observation: PublicationObservation) => {
      expect(observation.packageInspectRequests.map((request) => request.value)).toSatisfy(
        (requests: readonly PackagePublication[]) => {
          if (requests.at(0) === undefined) return false;
          for (const request of requests) {
            expect(request).toEqual(observation.scenario.packagePublication);
          }
          return true;
        },
      );
      expect(observation.packagePublishRequests.map((request) => request.value)).toEqual([
        observation.scenario.packagePublication,
      ]);
      expect(observation.packageState).toEqual(observation.scenario.packagePublication);
      expect(observation.hostedReleaseRequests.map((request) => request.value)).toEqual([
        observation.scenario.expectedHostedRelease,
      ]);
      expect(observation.hostedReleaseState).toEqual(observation.scenario.expectedHostedRelease);
      expect([
        observation.packagePublishRequests.at(0)?.sequence,
        observation.hostedReleaseRequests.at(0)?.sequence,
      ]).toSatisfy(
        ([packageSequence, hostedSequence]) =>
          packageSequence !== undefined
          && hostedSequence !== undefined
          && packageSequence < hostedSequence,
      );
      return true;
    });
  });

  it("creates an absent hosted release for an existing package", async () => {
    await expect(
      observePublication(
        sampleReleaseTestValue(arbitraryPublicationMissingHostedReleaseScenario()),
      ),
    ).resolves.toSatisfy((observation: PublicationObservation) => {
      expect(observation.packagePublishRequests).toEqual([]);
      expect(observation.hostedReleaseRequests.map((request) => request.value)).toEqual([
        observation.scenario.expectedHostedRelease,
      ]);
      expect(observation.hostedReleaseState).toEqual(observation.scenario.expectedHostedRelease);
      return true;
    });
  });

  it("repairs the hosted release without republishing an existing package", async () => {
    await expect(
      observePublication(sampleReleaseTestValue(arbitraryPublicationRetryScenario())),
    ).resolves.toSatisfy((observation: PublicationObservation) => {
      expect(observation.packagePublishRequests).toEqual([]);
      expect(observation.packageState).toEqual(observation.scenario.packagePublication);
      expect(observation.hostedReleaseRequests.map((request) => request.value)).toEqual([
        observation.scenario.expectedHostedRelease,
      ]);
      expect(observation.hostedReleaseState).toEqual(observation.scenario.expectedHostedRelease);
      return true;
    });
  });

  it("leaves the hosted release unchanged when package identity verification fails", async () => {
    await expect(
      observeFailedPublication(
        sampleReleaseTestValue(arbitraryPublicationIdentityMismatchScenario()),
      ),
    ).resolves.toSatisfy((observation: FailedPublicationObservation) => {
      expect(observation.error).toBeInstanceOf(ReleasePublicationError);
      expect(observation.packageInspectRequests.map((request) => request.value)).toEqual([
        observation.scenario.packagePublication,
      ]);
      expect(observation.packagePublishRequests).toEqual([]);
      expect(observation.hostedReleaseRequests).toEqual([]);
      expect(observation.hostedReleaseState).toEqual(observation.scenario.existingHostedRelease);
      return true;
    });
  });
});
