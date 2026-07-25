import * as fc from "fast-check";

import {
  type HostedRelease,
  PACKAGE_PROVENANCE,
  type PackagePublication,
  releaseTagForVersion,
} from "@/domains/release/publication";
import type { ReleaseData } from "@/domains/release/release-data";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { arbitraryConformantChangelogScenario } from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";

export interface PublicationScenario {
  readonly releaseData: ReleaseData;
  readonly tag: string;
  readonly taggedCommit: string;
  readonly changelog: string;
  readonly packagePublication: PackagePublication;
  readonly expectedHostedRelease: HostedRelease;
  readonly existingPackage: PackagePublication | null;
  readonly existingHostedRelease: HostedRelease | null;
}

export function arbitraryPublicationScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().map((scenario) => ({
    ...scenario,
    existingPackage: null,
    existingHostedRelease: null,
  }));
}

export function arbitraryPublicationRetryScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().chain((scenario) =>
    arbitraryDomainLiteral()
      .filter((staleBody) => staleBody !== scenario.expectedHostedRelease.body)
      .map((staleBody) => ({
        ...scenario,
        existingPackage: scenario.packagePublication,
        existingHostedRelease: {
          ...scenario.expectedHostedRelease,
          body: staleBody,
        },
      }))
  );
}

export function arbitraryPublicationMissingHostedReleaseScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().map((scenario) => ({
    ...scenario,
    existingPackage: scenario.packagePublication,
    existingHostedRelease: null,
  }));
}

export function arbitraryPublicationIdentityMismatchScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().chain((scenario) =>
    arbitraryDomainLiteral()
      .filter((staleBody) => staleBody !== scenario.expectedHostedRelease.body)
      .map((staleBody) => ({
        ...scenario,
        existingPackage: {
          ...scenario.packagePublication,
          commit: requireDistinctCommit(scenario.releaseData, scenario.taggedCommit),
        },
        existingHostedRelease: {
          ...scenario.expectedHostedRelease,
          body: staleBody,
        },
      }))
  );
}

export function arbitraryPublicationTagMismatchScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().chain((scenario) =>
    RELEASE_TEST_GENERATOR.distinctSemverFrom(scenario.releaseData.version).map((version) => ({
      ...scenario,
      tag: releaseTagForVersion(version),
      existingPackage: null,
      existingHostedRelease: null,
    }))
  );
}

function arbitraryPublicationBase(): fc.Arbitrary<
  Omit<PublicationScenario, "existingPackage" | "existingHostedRelease">
> {
  return RELEASE_TEST_GENERATOR.releaseData().chain((releaseData) =>
    fc
      .tuple(
        arbitraryDomainLiteral(),
        arbitraryConformantChangelogScenario(
          releaseData.version,
          releaseData.commits.map((commit) => commit.subject),
        ),
      )
      .map(([name, changelog]) => {
        const taggedCommit = requireTaggedCommit(releaseData);
        const tag = releaseTagForVersion(releaseData.version);
        return {
          releaseData,
          tag,
          taggedCommit,
          changelog: changelog.content,
          packagePublication: {
            name,
            version: releaseData.version,
            commit: taggedCommit,
            provenance: PACKAGE_PROVENANCE.VERIFIED,
          },
          expectedHostedRelease: {
            tag,
            title: tag,
            targetCommit: taggedCommit,
            body: changelog.versionSection,
          },
        };
      })
  );
}

function requireTaggedCommit(releaseData: ReleaseData): string {
  const commit = releaseData.commits.at(-1);
  if (commit === undefined) {
    throw new Error("Publication scenario requires at least one release commit");
  }
  return commit.sha;
}

function requireDistinctCommit(releaseData: ReleaseData, taggedCommit: string): string {
  const commit = releaseData.commits.find((candidate) => candidate.sha !== taggedCommit);
  if (commit === undefined) {
    throw new Error("Publication mismatch scenario requires a distinct release commit");
  }
  return commit.sha;
}
