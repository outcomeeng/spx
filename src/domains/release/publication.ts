import type { ReleaseData } from "@/domains/release/release-data";

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
  readonly packagePublication: PackagePublication;
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
    ...input.packagePublication,
    version: input.releaseData.version,
    commit: input.taggedCommit,
    provenance: PACKAGE_PROVENANCE.VERIFIED,
  };
  if (!packagePublicationMatches(expectedPackage, input.packagePublication)) {
    throw new ReleasePublicationError("Package publication input does not match the verified release identity");
  }

  const existingPackage = await input.packagePublisher.inspect(expectedPackage);
  if (existingPackage === null) {
    await input.packagePublisher.publish(expectedPackage);
  } else if (!packagePublicationMatches(expectedPackage, existingPackage)) {
    throw new ReleasePublicationError("Published package does not match the verified release identity");
  }

  const confirmedPackage = await input.packagePublisher.inspect(expectedPackage);
  if (confirmedPackage === null || !packagePublicationMatches(expectedPackage, confirmedPackage)) {
    throw new ReleasePublicationError("Package publication could not be confirmed with verified provenance");
  }

  await input.hostedReleasePublisher.reconcile(
    hostedReleaseFor(input.tag, input.taggedCommit, input.releaseNotesSection),
  );
}
