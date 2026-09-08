import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";

import { PACKAGE_MANIFEST } from "@/commands/release/package-manifest";
import {
  DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES,
  publishReleaseCommand,
  type PublishReleaseCommandOptions,
  type PublishReleasePublishers,
} from "@/commands/release/publish";
import {
  type HostedRelease,
  type HostedReleasePublisher,
  type PackagePublication,
  type PackagePublisher,
  type PublicationDelay,
  publishRelease,
  type PublishReleaseInput,
} from "@/domains/release/publication";
import { DEFAULT_CHANGELOG_PATH } from "@/domains/release/release-notes";
import { RELEASE_CLI } from "@/interfaces/cli/release";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import type {
  PublicationCheckoutDriftScenario,
  PublicationCommittedReadScenario,
  PublicationConfirmationFailureScenario,
  PublicationScenario,
} from "@testing/generators/release/publication";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { type GitWorktreeEnv, withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import {
  observeReleaseCliFailure,
  parseReleaseCli,
  releaseCliFailureDrives,
  type ReleaseCliFailureObservation,
} from "@testing/harnesses/release/cli";
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
  /** Every ref the command asked to resolve to a commit, in request order. */
  readonly commitRequests: readonly CommitRequest[];
  readonly releaseDataRequests: readonly ReleaseDataRequest[];
  readonly releaseNotesRequests: readonly ReleaseNotesRequest[];
  readonly packagePublisherProductDirs: readonly string[];
  readonly hostedReleasePublisherProductDirs: readonly string[];
}

export interface CommitRequest {
  readonly productDir: string;
  readonly ref: string;
}

export interface ReleaseDataRequest {
  readonly productDir: string;
  readonly version: string;
  readonly tag: string;
}

export interface ReleaseNotesRequest {
  readonly productDir: string;
  readonly tag: string;
  readonly changelogPath: string;
}

export interface PublishReleaseCliObservation {
  readonly scenario: PublicationScenario;
  readonly requests: readonly PublishReleaseCommandOptions[];
  /** The publisher ports the descriptor was configured with. */
  readonly wiredPublishers: PublishReleasePublishers;
  /** The publisher ports the command received on each invocation. */
  readonly receivedPublishers: readonly PublishReleasePublishers[];
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

export interface ConfirmationRetryObservation extends PublicationObservation {
  /** The error the publication rejected with; undefined when it confirmed. */
  readonly error: unknown;
  /** The waits the confirmation asked for, in order. */
  readonly waits: readonly number[];
}

/**
 * Drives a publication whose registry serves one record per confirmation attempt,
 * so the confirmation's reads, waits, and hosted-release request are observable
 * over a schedule no test spends.
 */
export async function observeConfirmationRetry(
  scenario: PublicationScenario & { readonly postPublishStates: readonly PackagePublication[] },
): Promise<ConfirmationRetryObservation> {
  const sequence = new PublicationRequestSequence();
  const packagePublisher = new RecordingPackagePublisher(
    scenario.existingPackage,
    sequence,
    (publication) => publication,
    scenario.postPublishStates,
  );
  const hostedReleasePublisher = new RecordingHostedReleasePublisher(scenario.existingHostedRelease, sequence);
  const recorded = recordingDelay();
  let error: unknown;
  try {
    await publishRelease(
      publicationInput(scenario, packagePublisher, hostedReleasePublisher, recorded.delay),
    );
  } catch (caught) {
    error = caught;
  }
  return {
    ...publicationObservation(scenario, packagePublisher, hostedReleasePublisher),
    error,
    waits: recorded.waits,
  };
}

/** What the default publish dependencies read back from a real product repository. */
export interface DefaultPublishDependenciesObservation {
  readonly scenario: PublicationCheckoutDriftScenario;
  readonly packageIdentity: { readonly name: string; readonly version: string };
  /** The commit the harness tagged. */
  readonly tagCommit: string;
  /** The commit the default dependencies resolved for the tag. */
  readonly taggedCommit: string;
  /** The checkout's head after it moved past the tag. */
  readonly headCommit: string;
  /** The commit the default dependencies resolved for the checkout's head. */
  readonly checkoutCommit: string;
  /** The changelog the default dependencies read for the tag. */
  readonly changelog: string;
  /** The changelog read with the product directory addressed through a symbolic link to the checkout. */
  readonly changelogThroughSymlinkedCheckout: string;
  /** The changelog the checkout's working tree holds after moving past the tag. */
  readonly checkoutChangelog: string;
}

/** What the default publish dependencies read back for inputs a real product repository cannot satisfy. */
export interface CommittedReleaseReadObservation {
  readonly scenario: PublicationCommittedReadScenario;
  /** The commit the harness tagged. */
  readonly tagCommit: string;
  /** The commit the default dependencies resolved for the tag. */
  readonly taggedCommit: string;
  /** The changelog the default dependencies read at the tag from the nested configured path. */
  readonly changelog: string;
  /** The error resolving a tag no commit carries rejected with; undefined when it resolved. */
  readonly absentTagFailure: unknown;
  /** The error resolving a tag operand git would parse as a long option rejected with; undefined when it resolved. */
  readonly optionShapedTagFailure: unknown;
  /** The error reading the changelog's committed directory in place of the file rejected with; undefined when it read. */
  readonly directoryChangelogFailure: unknown;
}
const SYMLINKED_CHECKOUT_PREFIX = "spx-publish-symlinked-checkout-";
const SYMLINKED_CHECKOUT_NAME = "checkout";
const CHECKOUT_ADVANCE_COMMIT_MESSAGE = "advance the checkout past the release tag";
const CHANGELOG_TEXT_ENCODING = "utf8";

/** Commits the scenario's package manifest and changelog at `changelogPath`, tags the commit, and returns its SHA. */
async function commitTaggedRelease(
  env: GitWorktreeEnv,
  scenario: PublicationScenario,
  changelogPath: string,
): Promise<string> {
  await env.writeTracked(
    PACKAGE_MANIFEST,
    JSON.stringify({ name: scenario.packagePublication.name, version: scenario.packagePublication.version }),
  );
  await env.writeTracked(changelogPath, scenario.changelog);
  await env.commit(scenario.tag);
  await env.runGit([GIT_TEST_SUBCOMMANDS.TAG, scenario.tag]);
  return (await env.runGit([GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD])).trim();
}

/**
 * Materializes the scenario's package manifest and changelog in a real git
 * repository, tags the commit, commits the drifted changelog on top so the
 * checkout moves past the tag, and reads the release inputs back through the
 * production default dependencies — real filesystem and real git, no
 * controlled boundary.
 */
export async function observeDefaultPublishDependencies(
  scenario: PublicationCheckoutDriftScenario,
): Promise<DefaultPublishDependenciesObservation> {
  let observation: DefaultPublishDependenciesObservation | undefined;
  await withGitWorktreeEnv(async (env) => {
    const tagCommit = await commitTaggedRelease(env, scenario, DEFAULT_CHANGELOG_PATH);
    await env.writeTracked(DEFAULT_CHANGELOG_PATH, scenario.checkoutChangelog);
    await env.commit(CHECKOUT_ADVANCE_COMMIT_MESSAGE);
    const headCommit = (await env.runGit([GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD])).trim();
    const checkoutChangelog = await readFile(join(env.productDir, DEFAULT_CHANGELOG_PATH), CHANGELOG_TEXT_ENCODING);

    const [packageIdentity, taggedCommit, checkoutCommit, changelog] = await Promise.all([
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readPackageIdentity(env.productDir),
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.resolveCommit(env.productDir, scenario.tag),
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.resolveCommit(env.productDir, GIT_ROOT_COMMAND.HEAD),
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readReleaseNotes(
        env.productDir,
        scenario.tag,
        DEFAULT_CHANGELOG_PATH,
      ),
    ]);
    const changelogThroughSymlinkedCheckout = await withTempDir(SYMLINKED_CHECKOUT_PREFIX, async (linkRoot) => {
      const symlinkedProductDir = join(linkRoot, SYMLINKED_CHECKOUT_NAME);
      await symlink(env.productDir, symlinkedProductDir);
      return await DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readReleaseNotes(
        symlinkedProductDir,
        scenario.tag,
        DEFAULT_CHANGELOG_PATH,
      );
    });
    observation = {
      scenario,
      packageIdentity,
      tagCommit,
      taggedCommit,
      headCommit,
      checkoutCommit,
      changelog,
      changelogThroughSymlinkedCheckout,
      checkoutChangelog,
    };
  });
  if (observation === undefined) {
    throw new Error("Default publish dependencies produced no observation");
  }
  return observation;
}

/**
 * Materializes the scenario's tagged release with the changelog at its nested
 * configured path, then reads back through the production default dependencies
 * both the inputs the repository satisfies and the ones it cannot: a tag naming
 * no commit, an option-shaped tag operand, and the changelog's directory. The
 * settled results are observations; the linked test decides what they mean.
 */
export async function observeCommittedReleaseReads(
  scenario: PublicationCommittedReadScenario,
): Promise<CommittedReleaseReadObservation> {
  let observation: CommittedReleaseReadObservation | undefined;
  await withGitWorktreeEnv(async (env) => {
    const tagCommit = await commitTaggedRelease(env, scenario, scenario.changelogPath);
    const [taggedCommit, changelog] = await Promise.all([
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.resolveCommit(env.productDir, scenario.tag),
      DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readReleaseNotes(
        env.productDir,
        scenario.tag,
        scenario.changelogPath,
      ),
    ]);
    const [absentTagFailure, optionShapedTagFailure, directoryChangelogFailure] = await Promise.all([
      rejectionOf(DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.resolveCommit(env.productDir, scenario.absentTag)),
      rejectionOf(DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.resolveCommit(env.productDir, scenario.optionShapedTag)),
      rejectionOf(
        DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES.readReleaseNotes(
          env.productDir,
          scenario.tag,
          scenario.changelogDirectory,
        ),
      ),
    ]);
    observation = {
      scenario,
      tagCommit,
      taggedCommit,
      changelog,
      absentTagFailure,
      optionShapedTagFailure,
      directoryChangelogFailure,
    };
  });
  if (observation === undefined) {
    throw new Error("Committed release reads produced no observation");
  }
  return observation;
}

/** The error a read rejected with, or undefined when it fulfilled — an observation the linked test interprets. */
async function rejectionOf(read: Promise<unknown>): Promise<unknown> {
  try {
    await read;
    return undefined;
  } catch (error: unknown) {
    return error;
  }
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
  const commitRequests: CommitRequest[] = [];
  const releaseDataRequests: ReleaseDataRequest[] = [];
  const releaseNotesRequests: ReleaseNotesRequest[] = [];
  const packagePublisherProductDirs: string[] = [];
  const hostedReleasePublisherProductDirs: string[] = [];

  let publishedTag: string | undefined;
  const publish = async (): Promise<string> => {
    publishedTag = await publishReleaseCommand(
      { productDir: scenario.productDir, tag: scenario.tag },
      {
        createPackagePublisher: (productDir) => {
          packagePublisherProductDirs.push(productDir);
          return packagePublisher;
        },
        createHostedReleasePublisher: (productDir) => {
          hostedReleasePublisherProductDirs.push(productDir);
          return hostedReleasePublisher;
        },
      },
      {
        delay: recordingDelay().delay,
        readPackageIdentity: (productDir) => {
          packageIdentityProductDirs.push(productDir);
          return Promise.resolve({
            name: scenario.packagePublication.name,
            version: scenario.packagePublication.version,
          });
        },
        resolveCommit: (productDir, ref) => {
          commitRequests.push({ productDir, ref });
          if (ref === scenario.tag) return Promise.resolve(scenario.taggedCommit);
          if (ref === GIT_ROOT_COMMAND.HEAD) return Promise.resolve(scenario.checkoutCommit);
          return Promise.reject(new Error(`Publication scenario resolves no commit for ref ${ref}`));
        },
        resolveReleaseData: (productDir, version, requestedTag) => {
          releaseDataRequests.push({ productDir, version, tag: requestedTag });
          return Promise.resolve(scenario.releaseData);
        },
        readReleaseNotes: (productDir, requestedTag, changelogPath) => {
          releaseNotesRequests.push({ productDir, tag: requestedTag, changelogPath });
          return Promise.resolve(scenario.changelog);
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
      commitRequests,
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
  const receivedPublishers: PublishReleasePublishers[] = [];
  const stdout: string[] = [];
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
  const wiredPublishers: PublishReleasePublishers = {
    createPackagePublisher: () => packagePublisher,
    createHostedReleasePublisher: () => hostedReleasePublisher,
  };
  await parseReleaseCli({
    productDir: scenario.productDir,
    argv: [RELEASE_CLI.COMMAND, RELEASE_CLI.PUBLISH_COMMAND, RELEASE_CLI.TAG_FLAG, scenario.tag],
    overrides: {
      publishReleaseCommand: (options, publishers) => {
        requests.push(options);
        receivedPublishers.push(publishers);
        return Promise.resolve(scenario.tag);
      },
      publishReleasePublishers: wiredPublishers,
    },
    io: {
      writeStdout: (output) => stdout.push(output),
      writeStderr: () => undefined,
      exit: (exitCode) => {
        throw new Error(String(exitCode));
      },
    },
  });
  return { scenario, requests, wiredPublishers, receivedPublishers, stdout: stdout.join("") };
}

/** What the `release publish` verb wrote and how it exited when the command it dispatched rejected. */
export interface PublishReleaseCliFailureObservation extends ReleaseCliFailureObservation {
  readonly scenario: PublicationScenario;
}

/** Drives the `release publish` verb for `scenario` against a command that rejects with `failure`. */
export async function observePublishReleaseCliFailure(
  scenario: PublicationScenario,
  failure: Error,
): Promise<PublishReleaseCliFailureObservation> {
  const publishDrive = releaseCliFailureDrives(scenario.tag).find((drive) =>
    drive.verb === RELEASE_CLI.PUBLISH_COMMAND
  );
  if (publishDrive === undefined) {
    throw new Error("Release CLI failure drives name no publish verb");
  }
  return { scenario, ...(await observeReleaseCliFailure(scenario.productDir, publishDrive, failure)) };
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

  /** Reads served after publication, one per confirmation attempt; the last repeats once exhausted. */
  private postPublishReads = 0;

  constructor(
    private current: PackagePublication | null,
    private readonly sequence: PublicationRequestSequence,
    private readonly registryStateAfterPublish: (publication: PackagePublication) => PackagePublication | null,
    private readonly postPublishStates: readonly (PackagePublication | null)[] = [],
  ) {}

  inspect(publication: PackagePublication): Promise<PackagePublication | null> {
    this.inspectRequests.push(this.sequence.record(publication));
    if (this.publishRequests.length === 0 || this.postPublishStates.length === 0) {
      return Promise.resolve(this.current);
    }
    const index = Math.min(this.postPublishReads, this.postPublishStates.length - 1);
    this.postPublishReads += 1;
    return Promise.resolve(this.postPublishStates[index]);
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
  delay: PublicationDelay = recordingDelay().delay,
): PublishReleaseInput {
  return {
    releaseData: scenario.releaseData,
    tag: scenario.tag,
    taggedCommit: scenario.taggedCommit,
    checkoutCommit: scenario.checkoutCommit,
    releaseNotesSection: scenario.expectedHostedRelease.body,
    packageName: scenario.packagePublication.name,
    packagePublisher,
    hostedReleasePublisher,
    delay,
  };
}

export interface RecordingDelay {
  /** The waits the confirmation asked for, in the order it asked for them. */
  readonly waits: number[];
  readonly delay: PublicationDelay;
}

/**
 * The confirmation's wait boundary, recorded rather than spent. Evidence observes
 * the backoff schedule and the attempt count without holding a test for the ten
 * minutes the production schedule spans.
 */
export function recordingDelay(): RecordingDelay {
  const waits: number[] = [];
  return {
    waits,
    delay: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
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
