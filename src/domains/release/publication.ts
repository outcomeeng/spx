import type { ReleaseData } from "@/domains/release/release-data";

export const PACKAGE_PROVENANCE = {
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

export function publishRelease(_input: PublishReleaseInput): Promise<void> {
  return Promise.reject(new Error("Release publication is not implemented"));
}
