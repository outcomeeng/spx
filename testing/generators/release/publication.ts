import * as fc from "fast-check";

import {
  type HostedRelease,
  PACKAGE_IDENTITY_FIELDS,
  PACKAGE_PROVENANCE,
  type PackageIdentityField,
  type PackagePublication,
  PUBLICATION_CONFIRMATION_BACKOFF_MS,
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
  arbitraryConfiguredChangelogPath,
  arbitraryConformantChangelog,
  arbitraryConformantChangelogScenario,
  arbitraryEscapingChangelogPath,
  arbitraryNestedConfiguredChangelogPathScenario,
  arbitraryRootResolvingChangelogPath,
  changelogWithDuplicateCurrentVersionSections,
  changelogWithFooterReferenceScenario,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";

const MAX_PROCESS_EXIT_CODE = 255;
/** The prefix git reads as a long option, so an operand carrying it is parsed as an option rather than a revision. */
const GIT_LONG_OPTION_PREFIX = "--";

interface PublicationBaseScenario {
  readonly productDir: string;
  readonly releaseData: ReleaseData;
  readonly tag: string;
  readonly taggedCommit: string;
  /** The commit the product checkout's head resolves to; the tagged commit unless a scenario moves it. */
  readonly checkoutCommit: string;
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

/** A publication whose product checkout's head is a release commit other than the tagged one. */
export interface PublicationCheckoutMismatchScenario extends PublicationScenario {
  readonly checkoutCommit: string;
}

/**
 * A publication read back from a real product repository: the changelog committed at a
 * nested configured path, plus the inputs a read must reject — a tag naming no commit,
 * an option-shaped tag operand, and the changelog's directory in place of the file.
 */
export interface PublicationCommittedReadScenario extends PublicationScenario {
  readonly changelogPath: string;
  readonly changelogDirectory: string;
  readonly absentTag: string;
  readonly optionShapedTag: string;
}

/** Configured changelog paths a publication resolves against its product directory: one inside it, one escaping it, one naming it. */
export interface PublicationChangelogPathScenario {
  readonly productDir: string;
  readonly containedPath: string;
  readonly escapingPath: string;
  readonly rootResolvingPath: string;
}

export function arbitraryPublicationScenario(): fc.Arbitrary<PublicationScenario> {
  return arbitraryPublicationBase().map((scenario) => ({
    ...scenario,
    existingPackage: null,
    existingHostedRelease: null,
  }));
}

export function arbitraryPublicationChangelogPathScenario(): fc.Arbitrary<PublicationChangelogPathScenario> {
  return fc.record({
    productDir: fc.oneof(arbitraryPathSegment(), arbitraryWindowsRootedProductDir()),
    containedPath: arbitraryConfiguredChangelogPath(),
    escapingPath: arbitraryEscapingChangelogPath(),
    rootResolvingPath: arbitraryRootResolvingChangelogPath(),
  });
}

/** A product directory under a Windows drive or UNC root, so containment runs under Windows path semantics. */
function arbitraryWindowsRootedProductDir(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.oneof(RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots(), RELEASE_TEST_GENERATOR.distinctWindowsUncRoots()),
      arbitraryPathSegment(),
    )
    .map(([[root], segment]) => `${root}${segment}`);
}

export function arbitraryPublicationCheckoutMismatchScenario(): fc.Arbitrary<PublicationCheckoutMismatchScenario> {
  return arbitraryPublicationScenario().map((scenario) => ({
    ...scenario,
    checkoutCommit: requireDistinctCommit(scenario.releaseData, scenario.taggedCommit),
  }));
}

export function arbitraryPublicationCommittedReadScenario(): fc.Arbitrary<PublicationCommittedReadScenario> {
  return arbitraryPublicationScenario().chain((scenario) =>
    fc
      .record({
        changelogPath: arbitraryNestedConfiguredChangelogPathScenario(),
        absentVersion: RELEASE_TEST_GENERATOR.distinctSemverFrom(scenario.releaseData.version),
        optionName: arbitraryPathSegment(),
      })
      .map(({ changelogPath, absentVersion, optionName }) => ({
        ...scenario,
        changelogPath: changelogPath.path,
        changelogDirectory: changelogPath.directory,
        absentTag: releaseTagForVersion(absentVersion),
        optionShapedTag: `${GIT_LONG_OPTION_PREFIX}${optionName}`,
      }))
  );
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

/**
 * A fresh publication whose registry record carries the release identity but no
 * provenance for the first reads, then carries provenance. The registry exposes a
 * new version's metadata before its attestation, so the confirmation must read
 * past the early reads rather than treat the first one as the verdict.
 */
export interface PublicationProvenanceLagScenario extends PublicationScenario {
  /** The records the registry serves after publication, one per confirmation attempt. */
  readonly postPublishStates: readonly (PackagePublication | null)[];
  /** The number of reads that precede the one carrying provenance. */
  readonly lateReads: number;
}

export function arbitraryPublicationProvenanceLagScenario(): fc.Arbitrary<PublicationProvenanceLagScenario> {
  return arbitraryPublicationBase().chain((scenario) =>
    fc
      .array(fc.boolean(), { minLength: 1, maxLength: PUBLICATION_CONFIRMATION_BACKOFF_MS.length })
      .map((earlyReadIsAbsent) => ({
        ...scenario,
        existingPackage: null,
        existingHostedRelease: null,
        lateReads: earlyReadIsAbsent.length,
        // Both early outcomes the registry can serve after a publish: no record
        // yet, and a record whose attestation has not appeared. Each is retried.
        postPublishStates: [
          ...earlyReadIsAbsent.map((absent) =>
            absent ? null : { ...scenario.packagePublication, provenance: PACKAGE_PROVENANCE.UNVERIFIED }
          ),
          scenario.packagePublication,
        ],
      }))
  );
}

/**
 * A fresh publication whose registry record names a different commit. No wait
 * makes a mismatched identity correct, so the confirmation reports it without
 * consuming the backoff.
 */
export interface PublicationPostPublishIdentityScenario extends PublicationScenario {
  readonly postPublishStates: readonly PackagePublication[];
  /** The identity field the served record differs on, and both of its values. */
  readonly differingField: {
    readonly served: string;
    readonly verified: string;
  };
}

/**
 * A dispatch resumed after a prior run published: the registry already holds the
 * record, and its attestation appears only after the first reads. Nothing is
 * published again, and the confirmation waits the propagation out.
 */
export interface PublicationResumedProvenanceLagScenario extends PublicationScenario {
  readonly postPublishStates: readonly (PackagePublication | null)[];
  readonly lateReads: number;
}

export function arbitraryPublicationResumedProvenanceLagScenario(): fc.Arbitrary<
  PublicationResumedProvenanceLagScenario
> {
  return arbitraryPublicationBase().chain((scenario) =>
    fc
      .integer({ min: 1, max: PUBLICATION_CONFIRMATION_BACKOFF_MS.length })
      .map((lateReads) => ({
        ...scenario,
        existingPackage: { ...scenario.packagePublication, provenance: PACKAGE_PROVENANCE.UNVERIFIED },
        existingHostedRelease: null,
        lateReads,
        postPublishStates: [
          ...Array.from({ length: lateReads }, () => ({
            ...scenario.packagePublication,
            provenance: PACKAGE_PROVENANCE.UNVERIFIED,
          })),
          scenario.packagePublication,
        ],
      }))
  );
}

export function arbitraryPublicationPostPublishIdentityScenario(): fc.Arbitrary<
  PublicationPostPublishIdentityScenario
> {
  return arbitraryPublicationBase().chain((scenario) =>
    fc
      .record({
        name: arbitraryDomainLiteral().filter((name) => name !== scenario.packagePublication.name),
        version: RELEASE_TEST_GENERATOR.distinctSemverFrom(scenario.packagePublication.version),
        field: fc.constantFrom(...PACKAGE_IDENTITY_FIELDS),
      })
      .map(({ name, version, field }) => {
        const served: Record<PackageIdentityField, string> = {
          name,
          version,
          commit: requireDistinctCommit(scenario.releaseData, scenario.taggedCommit),
        };
        return {
          ...scenario,
          existingPackage: null,
          existingHostedRelease: null,
          postPublishStates: [{ ...scenario.packagePublication, [field]: served[field] }],
          differingField: {
            served: served[field],
            verified: scenario.packagePublication[field],
          },
        };
      })
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
          checkoutCommit: taggedCommit,
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
