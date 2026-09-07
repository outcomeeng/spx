import { Command } from "commander";

import { publishReleaseCommand, type PublishReleaseCommandOptions } from "@/commands/release/publish";
import {
  type HostedRelease,
  type HostedReleasePublisher,
  type PackagePublication,
  type PackagePublisher,
  publishRelease,
  type PublishReleaseInput,
} from "@/domains/release/publication";
import { type CliInvocation, SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createReleaseDomain, RELEASE_CLI } from "@/interfaces/cli/release";
import type {
  PublicationConfirmationFailureScenario,
  PublicationScenario,
} from "@testing/generators/release/publication";

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

export interface PublicationHarness {
  publish(): Promise<void>;
  observe(): PublicationObservation;
}

export interface PublishReleaseCommandObservation extends PublicationObservation {
  /** The tag the command returned; undefined when publication rejected before returning. */
  readonly tag: string | undefined;
  readonly packageIdentityProductDirs: readonly string[];
  readonly taggedCommitRequests: readonly TaggedCommitRequest[];
  readonly releaseDataRequests: readonly ReleaseDataRequest[];
  readonly releaseNotesRequests: readonly ReleaseNotesRequest[];
  readonly packagePublisherProductDirs: readonly string[];
  readonly hostedReleasePublisherProductDirs: readonly string[];
}

export interface TaggedCommitRequest {
  readonly productDir: string;
  readonly tag: string;
}

export interface ReleaseDataRequest extends TaggedCommitRequest {
  readonly version: string;
}

export interface ReleaseNotesRequest {
  readonly productDir: string;
  readonly changelogPath: string;
}

export interface PublishReleaseCliObservation {
  readonly scenario: PublicationScenario;
  readonly requests: readonly PublishReleaseCommandOptions[];
  readonly stdout: string;
}

export async function observePublication(scenario: PublicationScenario): Promise<PublicationObservation> {
  const harness = createPublicationHarness(scenario);
  await harness.publish();
  return harness.observe();
}

export function createPublicationHarness(
  scenario: PublicationScenario | PublicationConfirmationFailureScenario,
): PublicationHarness {
  const sequence = new PublicationRequestSequence();
  const packagePublisher = new RecordingPackagePublisher(
    scenario.existingPackage,
    sequence,
    "confirmedPackage" in scenario ? () => scenario.confirmedPackage : (publication) => publication,
  );
  const hostedReleasePublisher = new RecordingHostedReleasePublisher(
    scenario.existingHostedRelease,
    sequence,
  );
  return {
    publish: () => publishRelease(publicationInput(scenario, packagePublisher, hostedReleasePublisher)),
    observe: () => publicationObservation(scenario, packagePublisher, hostedReleasePublisher),
  };
}

export interface PublishReleaseCommandHarness {
  publish(): Promise<string>;
  observe(): PublishReleaseCommandObservation;
}

export async function observePublishReleaseCommand(
  scenario: PublicationScenario,
): Promise<PublishReleaseCommandObservation> {
  const harness = createPublishReleaseCommandHarness(scenario);
  await harness.publish();
  return harness.observe();
}

export function createPublishReleaseCommandHarness(scenario: PublicationScenario): PublishReleaseCommandHarness {
  const sequence = new PublicationRequestSequence();
  const packagePublisher = new RecordingPackagePublisher(
    scenario.existingPackage,
    sequence,
    (publication) => publication,
  );
  const hostedReleasePublisher = new RecordingHostedReleasePublisher(
    scenario.existingHostedRelease,
    sequence,
  );
  const packageIdentityProductDirs: string[] = [];
  const taggedCommitRequests: TaggedCommitRequest[] = [];
  const releaseDataRequests: ReleaseDataRequest[] = [];
  const releaseNotesRequests: ReleaseNotesRequest[] = [];
  const packagePublisherProductDirs: string[] = [];
  const hostedReleasePublisherProductDirs: string[] = [];

  let publishedTag: string | undefined;
  const publish = async (): Promise<string> => {
    publishedTag = await publishReleaseCommand(
      { productDir: scenario.productDir, tag: scenario.tag },
      {
        readPackageIdentity: (productDir) => {
          packageIdentityProductDirs.push(productDir);
          return Promise.resolve({
            name: scenario.packagePublication.name,
            version: scenario.packagePublication.version,
          });
        },
        resolveTaggedCommit: (productDir, requestedTag) => {
          taggedCommitRequests.push({ productDir, tag: requestedTag });
          return Promise.resolve(scenario.taggedCommit);
        },
        resolveReleaseData: (productDir, version, requestedTag) => {
          releaseDataRequests.push({ productDir, version, tag: requestedTag });
          return Promise.resolve(scenario.releaseData);
        },
        readReleaseNotes: (productDir, changelogPath) => {
          releaseNotesRequests.push({ productDir, changelogPath });
          return Promise.resolve(scenario.changelog);
        },
        createPackagePublisher: (productDir) => {
          packagePublisherProductDirs.push(productDir);
          return packagePublisher;
        },
        createHostedReleasePublisher: (productDir) => {
          hostedReleasePublisherProductDirs.push(productDir);
          return hostedReleasePublisher;
        },
      },
    );
    return publishedTag;
  };

  return {
    publish,
    observe: () => ({
      ...publicationObservation(scenario, packagePublisher, hostedReleasePublisher),
      tag: publishedTag,
      packageIdentityProductDirs,
      taggedCommitRequests,
      releaseDataRequests,
      releaseNotesRequests,
      packagePublisherProductDirs,
      hostedReleasePublisherProductDirs,
    }),
  };
}

export async function observePublishReleaseCli(
  scenario: PublicationScenario,
): Promise<PublishReleaseCliObservation> {
  const requests: PublishReleaseCommandOptions[] = [];
  const stdout: string[] = [];
  const program = new Command();
  const invocation: CliInvocation = {
    io: {
      writeStdout: (output) => stdout.push(output),
      writeStderr: () => undefined,
      setExitCode: () => undefined,
      exit: (exitCode) => {
        throw new Error(String(exitCode));
      },
    },
    resolveEffectiveInvocationDir: () => scenario.productDir,
    resolveProductContext: () => ({
      effectiveInvocationDir: scenario.productDir,
      productDir: scenario.productDir,
    }),
  };
  createReleaseDomain({
    publishReleaseCommand: (options) => {
      requests.push(options);
      return Promise.resolve(scenario.tag);
    },
  }).register(program, invocation);
  await program.parseAsync(
    [RELEASE_CLI.COMMAND, RELEASE_CLI.PUBLISH_COMMAND, RELEASE_CLI.TAG_FLAG, scenario.tag],
    { from: SPX_COMMANDER_PARSE_SOURCE },
  );
  return { scenario, requests, stdout: stdout.join("") };
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
    private readonly registryStateAfterPublish: (publication: PackagePublication) => PackagePublication | null,
  ) {}

  inspect(publication: PackagePublication): Promise<PackagePublication | null> {
    this.inspectRequests.push(this.sequence.record(publication));
    return Promise.resolve(this.current);
  }

  publish(publication: PackagePublication): Promise<void> {
    this.publishRequests.push(this.sequence.record(publication));
    this.current = this.registryStateAfterPublish(publication);
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
