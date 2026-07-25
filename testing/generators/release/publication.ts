import * as fc from "fast-check";

import {
  type HostedRelease,
  PACKAGE_PROVENANCE,
  type PackagePublication,
  releaseTagForVersion,
} from "@/domains/release/publication";
import type { ReleaseData } from "@/domains/release/release-data";
import {
  RELEASE_PUBLICATION_WORKFLOW,
  RELEASE_PUBLICATION_WORKFLOW_VIOLATION,
  RELEASE_PUBLISH_INVOCATION,
  type ReleasePublicationWorkflowSnapshot,
  type ReleasePublicationWorkflowViolation,
} from "@/interfaces/cli/release-publication-workflow";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  arbitraryConformantChangelogScenario,
  changelogWithDuplicateCurrentVersionSections,
  changelogWithFooterReferenceScenario,
} from "@testing/generators/release/changelog";
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

export interface PublicationWithExistingPackageScenario extends PublicationScenario {
  readonly existingPackage: PackagePublication;
}

export interface PublicationSectionValidationScenario {
  readonly version: string;
  readonly validChangelog: string;
  readonly expectedSection: string;
  readonly absentVersion: string;
  readonly duplicateChangelog: string;
  readonly footerChangelog: string;
  readonly footerExpectedSection: string;
}

export interface PublicationWorkflowViolationScenario {
  readonly snapshot: ReleasePublicationWorkflowSnapshot;
  readonly expectedViolation: ReleasePublicationWorkflowViolation;
}

export function arbitraryPublicationScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().map((scenario) => ({
    ...scenario,
    existingPackage: null,
    existingHostedRelease: null,
  }));
}

export function arbitraryPublicationRetryScenario(): fc.Arbitrary<PublicationWithExistingPackageScenario> {
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

export function arbitraryPublicationMissingHostedReleaseScenario(): fc.Arbitrary<
  PublicationWithExistingPackageScenario
> {
  return arbitraryPublicationBase().map((scenario) => ({
    ...scenario,
    existingPackage: scenario.packagePublication,
    existingHostedRelease: null,
  }));
}

export function arbitraryPublicationIdentityMismatchScenario(): fc.Arbitrary<
  PublicationWithExistingPackageScenario
> {
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

export function arbitraryPublicationSectionValidationScenario(): fc.Arbitrary<
  PublicationSectionValidationScenario
> {
  return arbitraryPublicationBase().chain((scenario) =>
    RELEASE_TEST_GENERATOR.distinctSemverFrom(scenario.releaseData.version).map((absentVersion) => {
      const subjects = scenario.releaseData.commits.map((commit) => commit.subject);
      const footer = changelogWithFooterReferenceScenario(scenario.releaseData.version, subjects);
      return {
        version: scenario.releaseData.version,
        validChangelog: scenario.changelog,
        expectedSection: scenario.expectedHostedRelease.body,
        absentVersion,
        duplicateChangelog: changelogWithDuplicateCurrentVersionSections(
          scenario.releaseData.version,
          subjects,
        ),
        footerChangelog: footer.content,
        footerExpectedSection: footer.versionSection,
      };
    })
  );
}

export function arbitraryPublicationWorkflowViolation(
  snapshot: ReleasePublicationWorkflowSnapshot,
): fc.Arbitrary<PublicationWorkflowViolationScenario> {
  return fc
    .constantFrom(...Object.values(RELEASE_PUBLICATION_WORKFLOW_VIOLATION))
    .map((expectedViolation) => ({
      snapshot: mutateWorkflowSnapshot(snapshot, expectedViolation),
      expectedViolation,
    }));
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

function mutateWorkflowSnapshot(
  snapshot: ReleasePublicationWorkflowSnapshot,
  violation: ReleasePublicationWorkflowViolation,
): ReleasePublicationWorkflowSnapshot {
  return {
    jobs: snapshot.jobs.map((job) => {
      const isPublishJob = job.id === RELEASE_PUBLICATION_WORKFLOW.JOB.PUBLISH;
      if (violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.COMMAND_ABSENT && isPublishJob) {
        return {
          ...job,
          commands: job.commands.filter((command) => command !== RELEASE_PUBLISH_INVOCATION),
        };
      }
      if (
        violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.DETERMINISTIC_DEPENDENCY_ABSENT
        && isPublishJob
      ) {
        return {
          ...job,
          needs: job.needs.filter((dependency) =>
            dependency !== RELEASE_PUBLICATION_WORKFLOW.JOB.DETERMINISTIC
          ),
        };
      }
      if (
        violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.PUBLISH_CONTENTS_WRITE_ABSENT
        && isPublishJob
      ) {
        return {
          ...job,
          permissions: {
            ...job.permissions,
            [RELEASE_PUBLICATION_WORKFLOW.PERMISSION.CONTENTS]: RELEASE_PUBLICATION_WORKFLOW.PERMISSION.READ,
          },
        };
      }
      if (
        violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.PUBLISH_ID_TOKEN_WRITE_ABSENT
        && isPublishJob
      ) {
        return {
          ...job,
          permissions: {
            ...job.permissions,
            [RELEASE_PUBLICATION_WORKFLOW.PERMISSION.ID_TOKEN]: RELEASE_PUBLICATION_WORKFLOW.PERMISSION.READ,
          },
        };
      }
      if (
        violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.NON_PUBLISH_CONTENTS_NOT_READ_ONLY
        && !isPublishJob
      ) {
        return {
          ...job,
          permissions: {
            ...job.permissions,
            [RELEASE_PUBLICATION_WORKFLOW.PERMISSION.CONTENTS]: RELEASE_PUBLICATION_WORKFLOW.PERMISSION.WRITE,
          },
        };
      }
      return job;
    }),
  };
}
