import {
  committedChangelogTreePath,
  type HostedReleasePublisher,
  type PackagePublisher,
  type PublicationDelay,
  publishRelease,
  ReleasePublicationError,
} from "@/domains/release/publication";
import { computeReleaseData, type ReleaseData } from "@/domains/release/release-data";
import { DEFAULT_CHANGELOG_PATH, validatedReleaseNotesSection } from "@/domains/release/release-notes";
import { committedFileContent } from "@/lib/git/release";
import { defaultGitDependencies, GIT_ROOT_COMMAND } from "@/lib/git/root";

import { type PackageIdentity, readPackageIdentity } from "./package-manifest";

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
  /** The wait between publication-confirmation attempts; the domain stays free of timers. */
  readonly delay: PublicationDelay;
  /** Resolves a ref — the release tag, or the checkout's head — to the commit it names; rejects a ref naming no commit. */
  readonly resolveCommit: (productDir: string, ref: string) => Promise<string>;
  readonly resolveReleaseData: (productDir: string, version: string, tag: string) => Promise<ReleaseData>;
  /** Reads the changelog as committed at the release tag, so a checkout that moved past the tag cannot change the published notes. */
  readonly readReleaseNotes: (productDir: string, tag: string, changelogPath: string) => Promise<string>;
}

export const DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES: PublishReleaseCommandDependencies = {
  readPackageIdentity,
  delay: async (milliseconds) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  },
  resolveCommit: async (productDir, ref) => {
    // `--verify` fails unless the operand names exactly one object, and
    // `--end-of-options` keeps an option-shaped operand from being echoed back
    // as if it were a revision.
    const result = await defaultGitDependencies.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [
        GIT_ROOT_COMMAND.REV_PARSE,
        GIT_ROOT_COMMAND.VERIFY,
        GIT_ROOT_COMMAND.END_OF_OPTIONS,
        `${ref}${GIT_COMMIT_SUFFIX}`,
      ],
      { cwd: productDir, reject: false },
    );
    if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
      throw new ReleasePublicationError(`Ref ${ref} does not resolve to a commit`);
    }
    return result.stdout.trim();
  },
  resolveReleaseData: async (productDir, version, tag) =>
    await computeReleaseData({ productDir, packageVersion: version, releaseRef: tag }),
  readReleaseNotes: async (productDir, tag, changelogPath) => {
    const treePath = committedChangelogTreePath(productDir, changelogPath);
    const changelog = await committedFileContent(tag, treePath, productDir, defaultGitDependencies);
    if (changelog === null) {
      throw new ReleasePublicationError(`Release tag ${tag} does not commit a changelog file at ${treePath}`);
    }
    return changelog;
  },
};

export async function publishReleaseCommand(
  options: PublishReleaseCommandOptions,
  publishers: PublishReleasePublishers,
  deps: PublishReleaseCommandDependencies = DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES,
): Promise<string> {
  const packageIdentity = await deps.readPackageIdentity(options.productDir);
  const tag = options.tag;
  const [taggedCommit, checkoutCommit, releaseData, changelog] = await Promise.all([
    deps.resolveCommit(options.productDir, tag),
    deps.resolveCommit(options.productDir, GIT_ROOT_COMMAND.HEAD),
    deps.resolveReleaseData(options.productDir, packageIdentity.version, tag),
    deps.readReleaseNotes(options.productDir, tag, options.changelogPath ?? DEFAULT_CHANGELOG_PATH),
  ]);
  await publishRelease({
    releaseData,
    tag,
    taggedCommit,
    checkoutCommit,
    releaseNotesSection: validatedReleaseNotesSection(changelog, packageIdentity.version),
    packageName: packageIdentity.name,
    packagePublisher: publishers.createPackagePublisher(options.productDir),
    hostedReleasePublisher: publishers.createHostedReleasePublisher(options.productDir),
    delay: deps.delay,
  });
  return tag;
}
