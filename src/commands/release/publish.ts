import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type HostedReleasePublisher,
  PACKAGE_PROVENANCE,
  type PackagePublisher,
  publishRelease,
  ReleasePublicationError,
  releaseTagForVersion,
} from "@/domains/release/publication";
import { computeReleaseData, type ReleaseData } from "@/domains/release/release-data";
import {
  DEFAULT_CHANGELOG_PATH,
  resolveReleaseNotesPath,
  validatedReleaseNotesSection,
} from "@/domains/release/release-notes";
import { defaultGitDependencies, GIT_ROOT_COMMAND } from "@/lib/git/root";
import { createGithubReleasePublisher } from "@/lib/release-publication/github-release-publisher";
import { createNpmPackagePublisher } from "@/lib/release-publication/npm-package-publisher";

import { canonicalizeExistingPath, createReleaseNotesFilesystem } from "./release-notes-filesystem";

const PACKAGE_MANIFEST = "package.json";
const GIT_COMMIT_SUFFIX = "^{commit}";

export interface PublishReleaseCommandOptions {
  readonly productDir: string;
  readonly changelogPath?: string;
}

export interface PublishReleaseCommandDependencies {
  readonly readPackageIdentity: (productDir: string) => Promise<{ readonly name: string; readonly version: string }>;
  readonly resolveTaggedCommit: (productDir: string, tag: string) => Promise<string>;
  readonly resolveReleaseData: (productDir: string, version: string, tag: string) => Promise<ReleaseData>;
  readonly readReleaseNotes: (productDir: string, changelogPath: string) => Promise<string>;
  readonly createPackagePublisher: (productDir: string) => PackagePublisher;
  readonly createHostedReleasePublisher: (productDir: string) => HostedReleasePublisher;
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
    const resolvedPath = resolveReleaseNotesPath(productDir, { changelogPath });
    const canonicalPath = await canonicalizeExistingPath(resolvedPath);
    if (canonicalPath !== resolvedPath) {
      throw new ReleasePublicationError(`Changelog path is not a canonical file: ${resolvedPath}`);
    }
    return await releaseNotesFilesystem.readArtifact(canonicalPath, canonicalPath);
  },
  createPackagePublisher: (productDir) => createNpmPackagePublisher({ productDir }),
  createHostedReleasePublisher: (productDir) => createGithubReleasePublisher({ productDir }),
};

export async function publishReleaseCommand(
  options: PublishReleaseCommandOptions,
  deps: PublishReleaseCommandDependencies = DEFAULT_PUBLISH_RELEASE_COMMAND_DEPENDENCIES,
): Promise<string> {
  const packageIdentity = await deps.readPackageIdentity(options.productDir);
  const tag = releaseTagForVersion(packageIdentity.version);
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
    packagePublication: {
      name: packageIdentity.name,
      version: packageIdentity.version,
      commit: taggedCommit,
      provenance: PACKAGE_PROVENANCE.VERIFIED,
    },
    packagePublisher: deps.createPackagePublisher(options.productDir),
    hostedReleasePublisher: deps.createHostedReleasePublisher(options.productDir),
  });
  return tag;
}

async function readPackageIdentity(
  productDir: string,
): Promise<{ readonly name: string; readonly version: string }> {
  const manifest = JSON.parse(await readFile(join(productDir, PACKAGE_MANIFEST), "utf8")) as unknown;
  if (!isRecord(manifest) || typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new ReleasePublicationError("package.json must declare a package name and version");
  }
  return { name: manifest.name, version: manifest.version };
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null;
}
