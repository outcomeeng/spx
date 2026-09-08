import {
  type HostedReleasePublisher,
  type PackagePublisher,
  publishRelease,
  ReleasePublicationError,
} from "@/domains/release/publication";
import { computeReleaseData, type ReleaseData } from "@/domains/release/release-data";
import {
  DEFAULT_CHANGELOG_PATH,
  resolveCanonicalReleaseNotesPath,
  validatedReleaseNotesSection,
} from "@/domains/release/release-notes";
import { defaultGitDependencies, GIT_ROOT_COMMAND } from "@/lib/git/root";

import { type PackageIdentity, readPackageIdentity } from "./package-manifest";
import { createReleaseNotesFilesystem } from "./release-notes-filesystem";

const GIT_COMMIT_SUFFIX = "^{commit}";

export interface PublishReleaseCommandOptions {
  readonly productDir: string;
  /** The release tag that triggered publication; verified against the package version before anything publishes. */
  readonly tag: string;
  readonly changelogPath?: string;
}

/**
 * The package-registry and repository-host publication ports the CLI descriptor
 * wires into the command; their production adapters live with the release-publication
 * backend concern, so the command constructs neither.
 */
export interface PublishReleasePublishers {
  readonly createPackagePublisher: (productDir: string) => PackagePublisher;
  readonly createHostedReleasePublisher: (productDir: string) => HostedReleasePublisher;
}

export interface PublishReleaseCommandDependencies {
  readonly readPackageIdentity: (productDir: string) => Promise<PackageIdentity>;
  readonly resolveTaggedCommit: (productDir: string, tag: string) => Promise<string>;
  readonly resolveReleaseData: (productDir: string, version: string, tag: string) => Promise<ReleaseData>;
  readonly readReleaseNotes: (productDir: string, changelogPath: string) => Promise<string>;
}

const releaseNotesFilesystem = createReleaseNotesFilesystem();

export const DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES: PublishReleaseCommandDependencies = {
  readPackageIdentity,
  resolveTaggedCommit: async (productDir, tag) => {
    const result = await defaultGitDependencies.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [GIT_ROOT_COMMAND.REV_PARSE, `${tag}${GIT_COMMIT_SUFFIX}`],
      { cwd: productDir, reject: false },
    );
    if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
      throw new ReleasePublicationError(`Release tag ${tag} does not resolve to a commit`);
    }
    return result.stdout.trim();
  },
  resolveReleaseData: async (productDir, version, tag) =>
    await computeReleaseData({ productDir, packageVersion: version, releaseRef: tag }),
  readReleaseNotes: async (productDir, changelogPath) => {
    const canonicalPath = await resolveCanonicalReleaseNotesPath(
      productDir,
      { changelogPath },
      releaseNotesFilesystem,
    );
    return await releaseNotesFilesystem.readArtifact(canonicalPath, canonicalPath);
  },
};

export async function publishReleaseCommand(
  options: PublishReleaseCommandOptions,
  publishers: PublishReleasePublishers,
  deps: PublishReleaseCommandDependencies = DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES,
): Promise<string> {
  const packageIdentity = await deps.readPackageIdentity(options.productDir);
  const tag = options.tag;
  const [taggedCommit, releaseData, changelog] = await Promise.all([
    deps.resolveTaggedCommit(options.productDir, tag),
    deps.resolveReleaseData(options.productDir, packageIdentity.version, tag),
    deps.readReleaseNotes(options.productDir, options.changelogPath ?? DEFAULT_CHANGELOG_PATH),
  ]);
  await publishRelease({
    releaseData,
    tag,
    taggedCommit,
    releaseNotesSection: validatedReleaseNotesSection(changelog, packageIdentity.version),
    packageName: packageIdentity.name,
    packagePublisher: publishers.createPackagePublisher(options.productDir),
    hostedReleasePublisher: publishers.createHostedReleasePublisher(options.productDir),
  });
  return tag;
}
