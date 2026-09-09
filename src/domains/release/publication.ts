import { relative, resolve, sep, win32 } from "node:path";

import type { ReleaseData } from "@/domains/release/release-data";
import {
  isPathContained,
  PATH_CONTAINMENT_ROOT_CANDIDATE,
  usesWindowsPathSemantics,
} from "@/lib/file-system/pathContainment";

/** The separator git uses between tree-path segments, whatever the host separator. */
const GIT_TREE_PATH_SEPARATOR = "/";

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

/**
 * The fields that name which release a registry record is. A record differing on
 * any of them is another release, which no wait repairs; provenance is excluded
 * because it is the one field that arrives late on a correct record.
 */
export const PACKAGE_IDENTITY_FIELDS = ["name", "version", "commit"] as const;

export type PackageIdentityField = (typeof PACKAGE_IDENTITY_FIELDS)[number];

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
  /**
   * The commit the product checkout's head resolves to. The registry receives the
   * checkout's payload and records its head, so publication proceeds only when this
   * is the tagged commit.
   */
  readonly checkoutCommit: string;
  readonly releaseNotesSection: string;
  /** The package name; version, commit, and provenance derive from the verified release inputs. */
  readonly packageName: string;
  readonly packagePublisher: PackagePublisher;
  readonly hostedReleasePublisher: HostedReleasePublisher;
  /**
   * The injected wait between confirmation attempts. Production sleeps; evidence
   * passes a controlled implementation that records the requested delays without
   * spending them, so the backoff schedule is observable without wall-clock time.
   */
  readonly delay: PublicationDelay;
}

/** Waits the requested number of milliseconds before the next confirmation attempt. */
export type PublicationDelay = (milliseconds: number) => Promise<void>;

/**
 * The confirmation backoff. A freshly published version is readable from the
 * registry before its provenance attestation is, so the first re-read can see a
 * record that is correct in every compared field except provenance. Each entry is
 * the wait before the next attempt; the schedule spans roughly ten minutes, which
 * absorbs registry propagation while still failing a release that never reaches
 * the registry.
 */
export const PUBLICATION_CONFIRMATION_BACKOFF_MS = [
  2_000,
  3_000,
  6_000,
  12_000,
  24_000,
  48_000,
  96_000,
  192_000,
  217_000,
] as const;

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
  const relativePath = productRelativeChangelogPath(productDir, changelogPath);
  if (relativePath.path === PATH_CONTAINMENT_ROOT_CANDIDATE || !isPathContained(productDir, changelogPath)) {
    throw new ReleasePublicationError(
      `Configured changelog path escapes or names the product directory: ${changelogPath}`,
    );
  }
  return relativePath.path.split(relativePath.separator).join(GIT_TREE_PATH_SEPARATOR);
}

interface ProductRelativePath {
  readonly path: string;
  readonly separator: string;
}

/** The configured changelog path relative to the product directory, under the path semantics the directory's root selects. */
function productRelativeChangelogPath(productDir: string, changelogPath: string): ProductRelativePath {
  if (usesWindowsPathSemantics(productDir)) {
    return { path: win32.relative(productDir, win32.resolve(productDir, changelogPath)), separator: win32.sep };
  }
  return { path: relative(resolve(productDir), resolve(productDir, changelogPath)), separator: sep };
}

export function packagePublicationMatches(
  expected: PackagePublication,
  actual: PackagePublication,
): boolean {
  return packagePublicationIdentityMatches(expected, actual)
    && actual.provenance === expected.provenance;
}

/**
 * Whether the record names the release the publication verified. Identity is the
 * dimension a wait can never repair: a record naming another package, version, or
 * commit is a defect to report, not a registry that has yet to catch up.
 */
export function packagePublicationIdentityMatches(
  expected: PackagePublication,
  actual: PackagePublication,
): boolean {
  return PACKAGE_IDENTITY_FIELDS.every((field) => actual[field] === expected[field]);
}

/** The first identity field the registry record disagrees with, for the failure message. */
function packageIdentityMismatch(
  expected: PackagePublication,
  actual: PackagePublication,
): string {
  const field = PACKAGE_IDENTITY_FIELDS.find((candidate) => actual[candidate] !== expected[candidate]);
  if (field === undefined) return "no identity field differs";
  return `${field} ${actual[field]} is not ${expected[field]}`;
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
  if (input.checkoutCommit !== input.taggedCommit) {
    throw new ReleasePublicationError(
      `Checkout head ${input.checkoutCommit} is not the commit tagged ${input.tag} (${input.taggedCommit})`,
    );
  }
  const expectedPackage: PackagePublication = {
    name: input.packageName,
    version: input.releaseData.version,
    commit: input.taggedCommit,
    provenance: PACKAGE_PROVENANCE.VERIFIED,
  };

  const existingPackage = await input.packagePublisher.inspect(expectedPackage);
  if (existingPackage !== null && !packagePublicationIdentityMatches(expectedPackage, existingPackage)) {
    throw new ReleasePublicationError(
      `Published package does not match the verified release identity: ${
        packageIdentityMismatch(expectedPackage, existingPackage)
      }`,
    );
  }
  if (existingPackage === null) {
    await input.packagePublisher.publish(expectedPackage);
  }

  // A record already carrying provenance is its own confirmation. Everything else
  // is confirmed under the backoff: a publish this dispatch just made, and a
  // record a prior dispatch published whose attestation has yet to appear — the
  // resumed run this operation exists to converge.
  if (existingPackage === null || !packagePublicationMatches(expectedPackage, existingPackage)) {
    await confirmPublication(input, expectedPackage);
  }

  await input.hostedReleasePublisher.reconcile(
    hostedReleaseFor(input.tag, input.taggedCommit, input.releaseNotesSection),
  );
}

/**
 * Re-reads the registry until the record carries verified provenance, whether
 * this dispatch published it or a prior one did. Two read outcomes are early rather than wrong and are retried under
 * the backoff: no record yet, and a record that matches the release identity but
 * reports no provenance, because the registry serves a new version's metadata
 * before its attestation. A record naming a different release fails at once,
 * because no wait makes a mismatched identity correct.
 */
async function confirmPublication(
  input: PublishReleaseInput,
  expectedPackage: PackagePublication,
): Promise<void> {
  for (let attempt = 0;; attempt += 1) {
    const actual = await input.packagePublisher.inspect(expectedPackage);
    if (actual !== null) {
      if (!packagePublicationIdentityMatches(expectedPackage, actual)) {
        throw new ReleasePublicationError(
          `Published package does not match the verified release identity: ${
            packageIdentityMismatch(expectedPackage, actual)
          }`,
        );
      }
      if (packagePublicationMatches(expectedPackage, actual)) return;
    }
    const wait = PUBLICATION_CONFIRMATION_BACKOFF_MS.at(attempt);
    if (wait === undefined) {
      throw new ReleasePublicationError("Package publication could not be confirmed with verified provenance");
    }
    await input.delay(wait);
  }
}
