import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ReleaseData } from "@/domains/release/release-data";

/** The separator git uses between tree-path segments, whatever the host separator. */
const GIT_TREE_PATH_SEPARATOR = "/";
const PARENT_DIRECTORY_SEGMENT = "..";

export const PACKAGE_PROVENANCE = {
  UNVERIFIED: "unverified",
  VERIFIED: "verified",
} as const;

export type PackageProvenance = (typeof PACKAGE_PROVENANCE)[keyof typeof PACKAGE_PROVENANCE];

export interface PackagePublication {
  readonly name: string;
  readonly version: string;
  readonly commit: string;
  readonly provenance: PackageProvenance;
}

export interface HostedRelease {
  readonly tag: string;
  readonly title: string;
  readonly targetCommit: string;
  readonly body: string;
}

export interface PackagePublisher {
  inspect(publication: PackagePublication): Promise<PackagePublication | null>;
  publish(publication: PackagePublication): Promise<void>;
}

export interface HostedReleasePublisher {
  reconcile(release: HostedRelease): Promise<void>;
}

export interface PublishReleaseInput {
  readonly releaseData: ReleaseData;
  readonly tag: string;
  readonly taggedCommit: string;
  readonly releaseNotesSection: string;
  /** The package name; version, commit, and provenance derive from the verified release inputs. */
  readonly packageName: string;
  readonly packagePublisher: PackagePublisher;
  readonly hostedReleasePublisher: HostedReleasePublisher;
}

export class ReleasePublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleasePublicationError";
  }
}

export function releaseTagForVersion(version: string): string {
  return `v${version}`;
}

/**
 * The git tree path of the configured changelog, relative to the product
 * directory — what a committed-tree read resolves against the release tag.
 * The check is lexical: a committed tree has no symlink to follow, so only a
 * path that escapes the product directory or names the directory itself is
 * rejected.
 */
export function committedChangelogTreePath(productDir: string, changelogPath: string): string {
  const relativePath = relative(resolve(productDir), resolve(productDir, changelogPath));
  const segments = relativePath.split(sep);
  if (
    relativePath.length === 0
    || isAbsolute(relativePath)
    || segments.at(0) === PARENT_DIRECTORY_SEGMENT
  ) {
    throw new ReleasePublicationError(`Configured changelog path escapes the product directory: ${changelogPath}`);
  }
  return segments.join(GIT_TREE_PATH_SEPARATOR);
}

export function packagePublicationMatches(
  expected: PackagePublication,
  actual: PackagePublication,
): boolean {
  return actual.name === expected.name
    && actual.version === expected.version
    && actual.commit === expected.commit
    && actual.provenance === expected.provenance;
}

export function hostedReleaseFor(
  tag: string,
  taggedCommit: string,
  releaseNotesSection: string,
): HostedRelease {
  return {
    tag,
    title: tag,
    targetCommit: taggedCommit,
    body: releaseNotesSection,
  };
}

export async function publishRelease(input: PublishReleaseInput): Promise<void> {
  const expectedTag = releaseTagForVersion(input.releaseData.version);
  if (input.tag !== expectedTag) {
    throw new ReleasePublicationError(
      `Release tag ${input.tag} does not match package version ${input.releaseData.version}`,
    );
  }
  const expectedPackage: PackagePublication = {
    name: input.packageName,
    version: input.releaseData.version,
    commit: input.taggedCommit,
    provenance: PACKAGE_PROVENANCE.VERIFIED,
  };

  const existingPackage = await input.packagePublisher.inspect(expectedPackage);
  if (existingPackage !== null && !packagePublicationMatches(expectedPackage, existingPackage)) {
    throw new ReleasePublicationError("Published package does not match the verified release identity");
  }
  if (existingPackage === null) {
    await input.packagePublisher.publish(expectedPackage);
  }

  // An already-published matching record is its own confirmation; only a fresh publish is re-read.
  const confirmedPackage = existingPackage ?? await input.packagePublisher.inspect(expectedPackage);
  if (confirmedPackage === null || !packagePublicationMatches(expectedPackage, confirmedPackage)) {
    throw new ReleasePublicationError("Package publication could not be confirmed with verified provenance");
  }

  await input.hostedReleasePublisher.reconcile(
    hostedReleaseFor(input.tag, input.taggedCommit, input.releaseNotesSection),
  );
}
