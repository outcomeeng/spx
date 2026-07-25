import {
  type HostedRelease,
  type HostedReleasePublisher,
  type PackagePublication,
  type PackagePublisher,
  publishRelease,
  type PublishReleaseInput,
} from "@/domains/release/publication";
import type { PublicationScenario } from "@testing/generators/release/publication";

export interface RecordedPublicationRequest<T> {
  readonly sequence: number;
  readonly value: T;
}

export interface PublicationObservation {
  readonly scenario: PublicationScenario;
  readonly packageInspectRequests: readonly RecordedPublicationRequest<PackagePublication>[];
  readonly packagePublishRequests: readonly RecordedPublicationRequest<PackagePublication>[];
  readonly hostedReleaseRequests: readonly RecordedPublicationRequest<HostedRelease>[];
  readonly packageState: PackagePublication | null;
  readonly hostedReleaseState: HostedRelease | null;
}

export interface FailedPublicationObservation extends PublicationObservation {
  readonly error: unknown;
}

export async function observePublication(scenario: PublicationScenario): Promise<PublicationObservation> {
  const sequence = new PublicationRequestSequence();
  const packagePublisher = new RecordingPackagePublisher(scenario.existingPackage, sequence);
  const hostedReleasePublisher = new RecordingHostedReleasePublisher(
    scenario.existingHostedRelease,
    sequence,
  );
  await publishRelease(publicationInput(scenario, packagePublisher, hostedReleasePublisher));
  return publicationObservation(scenario, packagePublisher, hostedReleasePublisher);
}

export async function observeFailedPublication(
  scenario: PublicationScenario,
): Promise<FailedPublicationObservation> {
  const sequence = new PublicationRequestSequence();
  const packagePublisher = new RecordingPackagePublisher(scenario.existingPackage, sequence);
  const hostedReleasePublisher = new RecordingHostedReleasePublisher(
    scenario.existingHostedRelease,
    sequence,
  );
  try {
    await publishRelease(publicationInput(scenario, packagePublisher, hostedReleasePublisher));
  } catch (error) {
    return {
      ...publicationObservation(scenario, packagePublisher, hostedReleasePublisher),
      error,
    };
  }
  throw new Error("Publication failure scenario completed without an error");
}

class PublicationRequestSequence {
  private nextSequence = 0;

  record<T>(value: T): RecordedPublicationRequest<T> {
    const request = { sequence: this.nextSequence, value };
    this.nextSequence += 1;
    return request;
  }
}

class RecordingPackagePublisher implements PackagePublisher {
  readonly inspectRequests: RecordedPublicationRequest<PackagePublication>[] = [];
  readonly publishRequests: RecordedPublicationRequest<PackagePublication>[] = [];

  constructor(
    private current: PackagePublication | null,
    private readonly sequence: PublicationRequestSequence,
  ) {}

  inspect(publication: PackagePublication): Promise<PackagePublication | null> {
    this.inspectRequests.push(this.sequence.record(publication));
    return Promise.resolve(this.current);
  }

  publish(publication: PackagePublication): Promise<void> {
    this.publishRequests.push(this.sequence.record(publication));
    this.current = publication;
    return Promise.resolve();
  }

  state(): PackagePublication | null {
    return this.current;
  }
}

class RecordingHostedReleasePublisher implements HostedReleasePublisher {
  readonly reconcileRequests: RecordedPublicationRequest<HostedRelease>[] = [];

  constructor(
    private current: HostedRelease | null,
    private readonly sequence: PublicationRequestSequence,
  ) {}

  reconcile(release: HostedRelease): Promise<void> {
    this.reconcileRequests.push(this.sequence.record(release));
    this.current = release;
    return Promise.resolve();
  }

  state(): HostedRelease | null {
    return this.current;
  }
}

function publicationInput(
  scenario: PublicationScenario,
  packagePublisher: PackagePublisher,
  hostedReleasePublisher: HostedReleasePublisher,
): PublishReleaseInput {
  return {
    releaseData: scenario.releaseData,
    tag: scenario.tag,
    taggedCommit: scenario.taggedCommit,
    releaseNotesSection: scenario.expectedHostedRelease.body,
    packagePublication: scenario.packagePublication,
    packagePublisher,
    hostedReleasePublisher,
  };
}

function publicationObservation(
  scenario: PublicationScenario,
  packagePublisher: RecordingPackagePublisher,
  hostedReleasePublisher: RecordingHostedReleasePublisher,
): PublicationObservation {
  return {
    scenario,
    packageInspectRequests: packagePublisher.inspectRequests,
    packagePublishRequests: packagePublisher.publishRequests,
    hostedReleaseRequests: hostedReleasePublisher.reconcileRequests,
    packageState: packagePublisher.state(),
    hostedReleaseState: hostedReleasePublisher.state(),
  };
}
