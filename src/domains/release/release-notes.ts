import { isAbsolute, relative, resolve, sep } from "node:path";

import type { AgentRunner } from "@/agent/agent-runner";
import type { ReleaseData } from "@/domains/release/release-data";

/**
 * The injected read-back dependency. After the agent writes the changelog, the
 * composition reads it back through this reader to validate it, so the composition
 * performs no direct filesystem access. The production implementation reads from
 * the filesystem; tests inject a reader over the temp working tree.
 */
export type ArtifactReader = (path: string) => Promise<string>;

/** The release-notes child's resolved configuration — the changelog output path. */
export interface ReleaseNotesConfig {
  /** The changelog path relative to the working tree; defaults to `CHANGELOG.md`. */
  readonly changelogPath?: string;
}

/** The default changelog path, relative to the product working tree. */
export const DEFAULT_CHANGELOG_PATH = "CHANGELOG.md";

/** The path segment that signals a relative path stepping above its base directory. */
const PARENT_DIRECTORY = "..";

/**
 * A release-notes generation failure: a configured changelog path escaping the
 * product working tree, or written notes that fail Keep a Changelog validation.
 */
export class ReleaseNotesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseNotesError";
  }
}

/** The Keep a Changelog top-level heading every conformant changelog opens with. */
export const CHANGELOG_TITLE = "# Changelog";

/** The Keep a Changelog change-group headings, the closed set a release section groups its entries under. */
export const CHANGELOG_CHANGE_GROUPS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"] as const;

export type ChangelogChangeGroup = (typeof CHANGELOG_CHANGE_GROUPS)[number];

/** The Keep a Changelog per-release section heading for a version. */
export function changelogVersionHeading(version: string): string {
  return `## [${version}]`;
}

/** The Keep a Changelog change-group heading for a group. */
export function changelogGroupHeading(group: ChangelogChangeGroup): string {
  return `### ${group}`;
}

/**
 * Resolves the changelog output path from the resolved configuration within the
 * product working tree: the configured `changelogPath` (default `CHANGELOG.md`)
 * joined under `workingDirectory` and normalized. A configured path that resolves
 * outside `workingDirectory` is rejected.
 */
export function resolveReleaseNotesPath(workingDirectory: string, config: ReleaseNotesConfig): string {
  const configuredPath = config.changelogPath ?? DEFAULT_CHANGELOG_PATH;
  const resolved = resolve(workingDirectory, configuredPath);
  const relativeToWorkingTree = relative(workingDirectory, resolved);
  const escapesWorkingTree = relativeToWorkingTree === PARENT_DIRECTORY
    || relativeToWorkingTree.startsWith(`${PARENT_DIRECTORY}${sep}`)
    || isAbsolute(relativeToWorkingTree);
  if (escapesWorkingTree) {
    throw new ReleaseNotesError(`Configured changelog path escapes the product working tree: ${configuredPath}`);
  }
  return resolved;
}

export interface ComposeReleaseNotesOptions {
  /** The release data the prompt describes. */
  readonly releaseData: ReleaseData;
  /** The release-notes child's resolved configuration. */
  readonly config: ReleaseNotesConfig;
  /** The product working tree the notes are written within. */
  readonly workingDirectory: string;
  /** The injected agent runner that writes the notes. */
  readonly agentRunner: AgentRunner;
  /** The injected reader the written notes are read back through. */
  readonly readArtifact: ArtifactReader;
}

/**
 * Generates the release notes: resolves the changelog path within the working
 * tree, assembles a prompt from the release data and resolved configuration only,
 * invokes the injected agent runner to write the changelog, reads the artifact
 * back through the injected reader, and validates its Keep a Changelog structure
 * and a section for the release version before resolving. Rejects when the
 * configured path escapes the working tree or the written notes fail validation.
 * A pure function of its inputs and injected dependencies — no direct filesystem
 * or process access.
 */
export async function composeReleaseNotes(options: ComposeReleaseNotesOptions): Promise<void> {
  const { releaseData, config, workingDirectory, agentRunner, readArtifact } = options;
  const changelogPath = resolveReleaseNotesPath(workingDirectory, config);
  const prompt = buildReleaseNotesPrompt(releaseData, changelogPath);
  await agentRunner.run({ prompt, workingDirectory });
  const writtenNotes = await readArtifact(changelogPath);
  assertConformsToKeepAChangelog(writtenNotes, releaseData.version);
}

/**
 * Assembles the release-notes prompt from the release data and the resolved
 * changelog path only: the version, the changelog path to write, the Keep a
 * Changelog format the notes must follow, and the commit subjects to describe.
 */
function buildReleaseNotesPrompt(releaseData: ReleaseData, changelogPath: string): string {
  const commitSubjects = releaseData.commits.map((commit) => commit.subject).join("\n");
  return [
    `Write release notes for version ${releaseData.version} to the changelog file at ${changelogPath}.`,
    `Follow the Keep a Changelog format: open the file with "${CHANGELOG_TITLE}", add a "${
      changelogVersionHeading(releaseData.version)
    }" section, and group its entries under headings drawn from ${CHANGELOG_CHANGE_GROUPS.join(", ")}.`,
    `Describe and group these commits faithfully, introducing no claim absent from them:`,
    commitSubjects,
  ].join("\n\n");
}

/**
 * Validates that the read-back notes conform to the Keep a Changelog structure and
 * carry a section for the release version. Throws when the title or the version
 * section is absent.
 */
function assertConformsToKeepAChangelog(notes: string, version: string): void {
  if (!notes.includes(CHANGELOG_TITLE)) {
    throw new ReleaseNotesError(`Generated release notes are missing the Keep a Changelog title "${CHANGELOG_TITLE}"`);
  }
  const versionHeading = changelogVersionHeading(version);
  if (!notes.includes(versionHeading)) {
    throw new ReleaseNotesError(
      `Generated release notes are missing a section for version ${version}: "${versionHeading}"`,
    );
  }
}
