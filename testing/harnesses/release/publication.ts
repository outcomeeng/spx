import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { Command } from "commander";

import {
  DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES,
  publishReleaseCommand,
  type PublishReleaseCommandOptions,
} from "@/commands/release/publish";
import {
  type HostedRelease,
  type HostedReleasePublisher,
  type PackagePublication,
  type PackagePublisher,
  publishRelease,
  type PublishReleaseInput,
} from "@/domains/release/publication";
import { DEFAULT_CHANGELOG_PATH } from "@/domains/release/release-notes";
import { type CliInvocation, SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createReleaseDomain, RELEASE_CLI } from "@/interfaces/cli/release";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import type {
  PublicationConfirmationFailureScenario,
  PublicationScenario,
} from "@testing/generators/release/publication";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

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

/** What the default publish dependencies read back from a real product repository. */
export interface DefaultPublishDependenciesObservation {
  readonly scenario: PublicationScenario;
  readonly packageIdentity: { readonly name: string; readonly version: string };
  readonly taggedCommit: string;
  readonly headCommit: string;
  readonly changelog: string;
  /** The changelog read with the product directory addressed through a symbolic link to the checkout. */
  readonly changelogThroughSymlinkedCheckout: string;
}

const PACKAGE_MANIFEST_FILE = "package.json";
const SYMLINKED_CHECKOUT_PREFIX = "spx-publish-symlinked-checkout-";
const SYMLINKED_CHECKOUT_NAME = "checkout";

/**
 * Materializes the scenario's package manifest and changelog in a real git
 * repository, tags the commit, and reads them back through the production
 * default dependencies — real filesystem and real git, no controlled boundary.
 */
export async function observeDefaultPublishDependencies(
  scenario: PublicationScenario,
): Promise<DefaultPublishDependenciesObservation> {
  let observation: DefaultPublishDependenciesObservation | undefined;
  await withGitWorktreeEnv(async (env) => {
    await env.writeTracked(
      PACKAGE_MANIFEST_FILE,
      JSON.stringify({ name: scenario.packagePublication.name, version: scenario.packagePublication.version }),
    );
    await env.writeTracked(DEFAULT_CHANGELOG_PATH, scenario.changelog);
    await env.commit(scenario.tag);
    await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, scenario.tag]);
    const headCommit = (await env.runGit([GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD])).trim();

    const [packageIdentity, taggedCommit, changelog] = await Promise.all([
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readPackageIdentity(env.productDir),
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.resolveTaggedCommit(env.productDir, scenario.tag),
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readReleaseNotes(env.productDir, DEFAULT_CHANGELOG_PATH),
    ]);
    const changelogThroughSymlinkedCheckout = await withTempDir(SYMLINKED_CHECKOUT_PREFIX, async (linkRoot) => {
      const symlinkedProductDir = join(linkRoot, SYMLINKED_CHECKOUT_NAME);
      await symlink(env.productDir, symlinkedProductDir);
      return await DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readReleaseNotes(
        symlinkedProductDir,
        DEFAULT_CHANGELOG_PATH,
      );
    });
    observation = {
      scenario,
      packageIdentity,
      taggedCommit,
      headCommit,
      changelog,
      changelogThroughSymlinkedCheckout,
    };
  });
  if (observation === undefined) {
    throw new Error("Default publish dependencies produced no observation");
  }
  return observation;
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
    packageName: scenario.packagePublication.name,
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
