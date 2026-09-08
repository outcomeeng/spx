import * as fc from "fast-check";

import {
  type HostedRelease,
  PACKAGE_PROVENANCE,
  type PackagePublication,
  releaseTagForVersion,
} from "@/domains/release/publication";
import {
  RELEASE_PUBLICATION_WORKFLOW,
  RELEASE_PUBLICATION_WORKFLOW_VIOLATION,
  type ReleasePublicationWorkflowSnapshot,
  type ReleasePublicationWorkflowViolation,
} from "@/domains/release/publication-workflow";
import type { ReleaseData } from "@/domains/release/release-data";
import { RELEASE_PUBLISH_INVOCATION } from "@/interfaces/cli/release";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  arbitraryConformantChangelog,
  arbitraryConformantChangelogScenario,
  changelogWithDuplicateCurrentVersionSections,
  changelogWithFooterReferenceScenario,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";

const MAX_PROCESS_EXIT_CODE = 255;

interface PublicationBaseScenario {
  readonly productDir: string;
  readonly releaseData: ReleaseData;
  readonly tag: string;
  readonly taggedCommit: string;
  readonly changelog: string;
  readonly packagePublication: PackagePublication;
  readonly expectedHostedRelease: HostedRelease;
}

export interface PublicationScenario extends PublicationBaseScenario {
  readonly existingPackage: PackagePublication | null;
  readonly existingHostedRelease: HostedRelease | null;
}

export interface PublicationWithExistingPackageScenario extends PublicationScenario {
  readonly existingPackage: PackagePublication;
}

export interface PublicationRetryScenario extends PublicationWithExistingPackageScenario {
  readonly existingHostedRelease: HostedRelease;
}

export type PackagePublicationIdentityMismatches = {
  readonly [Field in keyof PackagePublication]: PackagePublication;
};

export interface PublicationIdentityMismatchScenario extends PublicationWithExistingPackageScenario {
  readonly identityMismatches: PackagePublicationIdentityMismatches;
}

export interface PublicationSectionValidationScenario {
  readonly version: string;
  readonly validChangelog: string;
  readonly absentVersion: string;
  readonly duplicateChangelog: string;
  readonly footerChangelog: string;
}

/** A publish request the registry then fails to confirm: the package is absent or lacks verified provenance. */
export interface PublicationConfirmationFailureScenario extends PublicationScenario {
  readonly confirmedPackage: PackagePublication | null;
}

export interface PublicationWorkflowViolationScenario {
  readonly snapshot: ReleasePublicationWorkflowSnapshot;
  readonly expectedViolation: ReleasePublicationWorkflowViolation;
}

/** A publication whose product checkout moved past the release tag, committing a changelog that differs from the tagged one. */
export interface PublicationCheckoutDriftScenario extends PublicationScenario {
  readonly checkoutChangelog: string;
}

export function arbitraryPublicationScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().map((scenario) => ({
    ...scenario,
    existingPackage: null,
    existingHostedRelease: null,
  }));
}

export function arbitraryPublicationCheckoutDriftScenario(): fc.Arbitrary<PublicationCheckoutDriftScenario> {
  return arbitraryPublicationScenario().chain((scenario) =>
    arbitraryConformantChangelog(
      scenario.releaseData.version,
      scenario.releaseData.commits.map((commit) => commit.subject),
    )
      .filter((changelog) => changelog !== scenario.changelog)
      .map((checkoutChangelog) => ({ ...scenario, checkoutChangelog }))
  );
}

export function arbitraryPublicationRetryScenario(): fc.Arbitrary<PublicationRetryScenario> {
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

export function arbitraryPublicationConfirmationFailureScenario(): fc.Arbitrary<
  PublicationConfirmationFailureScenario
> {
  return arbitraryPublicationBase().chain((scenario) =>
    fc
      .record({
        confirmedPackage: fc.constantFrom<PackagePublication | null>(null, {
          ...scenario.packagePublication,
          provenance: PACKAGE_PROVENANCE.UNVERIFIED,
        }),
        staleBody: arbitraryDomainLiteral().filter((body) => body !== scenario.expectedHostedRelease.body),
      })
      .map(({ confirmedPackage, staleBody }) => ({
        ...scenario,
        existingPackage: null,
        existingHostedRelease: { ...scenario.expectedHostedRelease, body: staleBody },
        confirmedPackage,
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
  PublicationIdentityMismatchScenario
> {
  return arbitraryPublicationBase().chain((scenario) =>
    fc
      .record({
        name: arbitraryDomainLiteral().filter((name) => name !== scenario.packagePublication.name),
        version: RELEASE_TEST_GENERATOR.distinctSemverFrom(scenario.packagePublication.version),
        staleBody: arbitraryDomainLiteral().filter((body) => body !== scenario.expectedHostedRelease.body),
      })
      .map(({ name, version, staleBody }) => {
        const identityMismatches = {
          name: { ...scenario.packagePublication, name },
          version: { ...scenario.packagePublication, version },
          commit: {
            ...scenario.packagePublication,
            commit: requireDistinctCommit(scenario.releaseData, scenario.taggedCommit),
          },
          provenance: {
            ...scenario.packagePublication,
            provenance: PACKAGE_PROVENANCE.UNVERIFIED,
          },
        } satisfies PackagePublicationIdentityMismatches;
        return {
          ...scenario,
          identityMismatches,
          existingPackage: identityMismatches.commit,
          existingHostedRelease: {
            ...scenario.expectedHostedRelease,
            body: staleBody,
          },
        };
      })
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
        absentVersion,
        duplicateChangelog: changelogWithDuplicateCurrentVersionSections(
          scenario.releaseData.version,
          subjects,
        ),
        footerChangelog: footer.content,
      };
    })
  );
}

/** The exit codes a completed package-registry or repository-host command can report. */
export function arbitraryPublicationCommandExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: MAX_PROCESS_EXIT_CODE });
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

function arbitraryPublicationBase(): fc.Arbitrary<PublicationBaseScenario> {
  return RELEASE_TEST_GENERATOR.releaseData().chain((releaseData) =>
    fc
      .tuple(
        arbitraryPathSegment(),
        arbitraryDomainLiteral(),
        arbitraryConformantChangelogScenario(
          releaseData.version,
          releaseData.commits.map((commit) => commit.subject),
        ),
      )
      .map(([productDir, name, changelog]) => {
        const taggedCommit = requireTaggedCommit(releaseData);
        const tag = releaseTagForVersion(releaseData.version);
        return {
          productDir,
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
      if (violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.DEPENDENCY_INSTALL_ABSENT && isPublishJob) {
        return {
          ...job,
          commands: job.commands.filter((command) => command !== RELEASE_PUBLICATION_WORKFLOW.DEPENDENCY_INSTALL),
        };
      }
      if (violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.DEPENDENCY_INSTALL_AFTER_PUBLISH && isPublishJob) {
        return {
          ...job,
          commands: [
            ...job.commands.filter((command) => command !== RELEASE_PUBLICATION_WORKFLOW.DEPENDENCY_INSTALL),
            RELEASE_PUBLICATION_WORKFLOW.DEPENDENCY_INSTALL,
          ],
        };
      }
      if (
        violation === RELEASE_PUBLICATION_WORKFLOW_VIOLATION.DETERMINISTIC_DEPENDENCY_ABSENT
        && isPublishJob
      ) {
        return {
          ...job,
          needs: job.needs.filter((dependency) => dependency !== RELEASE_PUBLICATION_WORKFLOW.JOB.DETERMINISTIC),
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
