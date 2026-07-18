import { mkdir, symlink } from "node:fs/promises";
import { join, sep } from "node:path";

import { releaseNotesCommand } from "@/commands/release";
import { composeReleaseNotes, DEFAULT_CHANGELOG_PATH, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import { arbitraryConfiguredChangelogPath } from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { releaseDataDrivenAgentRunner } from "@testing/harnesses/release/agent-runner";
import { approvingReleaseNotesFaithfulnessAuditor } from "@testing/harnesses/release/release-notes";
import {
  RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  withReleaseNotesEnv,
} from "@testing/harnesses/release/release-notes-env";

export interface ReleaseNotesPathObservation {
  readonly workingDirectory: string;
  readonly resolvedPath: string;
  readonly configuredPath: string | undefined;
}

export interface ReleaseNotesWriteObservation {
  readonly content: string;
  readonly version: string;
}

export interface ReleaseNotesCommandObservation extends ReleaseNotesWriteObservation {
  readonly output: string;
  readonly resolvedPath: string;
}

export interface CanonicalReleaseNotesCommandObservation extends ReleaseNotesCommandObservation {
  readonly lexicalPath: string;
  readonly canonicalPath: string;
}

export async function observeDefaultReleaseNotesPath(): Promise<ReleaseNotesPathObservation> {
  let observation: ReleaseNotesPathObservation | undefined;
  await withReleaseNotesEnv(async ({ workingDirectory }) => {
    observation = {
      workingDirectory,
      resolvedPath: resolveReleaseNotesPath(workingDirectory, {}),
      configuredPath: undefined,
    };
  });
  return requireObservation(observation);
}

export async function observeConfiguredReleaseNotesPath(): Promise<ReleaseNotesPathObservation> {
  let observation: ReleaseNotesPathObservation | undefined;
  await withReleaseNotesEnv(async ({ workingDirectory }) => {
    const configuredPath = sampleReleaseTestValue(arbitraryConfiguredChangelogPath());
    observation = {
      workingDirectory,
      resolvedPath: resolveReleaseNotesPath(workingDirectory, { changelogPath: configuredPath }),
      configuredPath,
    };
  });
  return requireObservation(observation);
}

export async function observeComposedReleaseNotes(): Promise<ReleaseNotesWriteObservation> {
  let observation: ReleaseNotesWriteObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    await composeReleaseNotes({
      releaseData,
      config: {},
      workingDirectory: env.workingDirectory,
      agentRunner: releaseDataDrivenAgentRunner(
        env.workingDirectory,
        resolvedPath,
        releaseData.commits.map((commit) => commit.subject),
      ),
      readArtifact: env.readArtifact,
      createArtifactStage: env.createArtifactStage,
      promoteArtifact: env.promoteArtifact,
      faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
      canonicalizePath: env.canonicalizePath,
      isSymbolicLink: env.isSymbolicLink,
      isFile: env.isFile,
    });
    observation = { content: await env.readArtifact(resolvedPath), version: releaseData.version };
  });
  return requireObservation(observation);
}

export async function observeReleaseNotesCommand(): Promise<ReleaseNotesCommandObservation> {
  let observation: ReleaseNotesCommandObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    const output = await releaseNotesCommand({
      productDir: env.workingDirectory,
      config: {},
      releaseData,
      agentRunner: releaseDataDrivenAgentRunner(
        env.workingDirectory,
        resolvedPath,
        releaseData.commits.map((commit) => commit.subject),
      ),
      faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
      filesystem: env,
    });
    observation = {
      output,
      resolvedPath,
      content: await env.readArtifact(resolvedPath),
      version: releaseData.version,
    };
  });
  return requireObservation(observation);
}

export async function observeCanonicalReleaseNotesCommand(): Promise<CanonicalReleaseNotesCommandObservation> {
  let observation: CanonicalReleaseNotesCommandObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
    const [actualDirectoryName, childDirectoryName, symlinkName] = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    );
    const actualDirectory = join(env.workingDirectory, actualDirectoryName);
    const actualChildDirectory = join(actualDirectory, childDirectoryName);
    const symlinkPath = join(env.workingDirectory, symlinkName);
    const changelogPath = `${symlinkName}${sep}..${sep}${DEFAULT_CHANGELOG_PATH}`;
    const lexicalPath = resolveReleaseNotesPath(env.workingDirectory, { changelogPath });
    const canonicalPath = join(actualDirectory, DEFAULT_CHANGELOG_PATH);
    await mkdir(actualChildDirectory, { recursive: true });
    await symlink(actualChildDirectory, symlinkPath, RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE);
    const output = await releaseNotesCommand({
      productDir: env.workingDirectory,
      config: { changelogPath },
      releaseData,
      agentRunner: releaseDataDrivenAgentRunner(
        env.workingDirectory,
        canonicalPath,
        releaseData.commits.map((commit) => commit.subject),
      ),
      faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
      filesystem: env,
    });
    observation = {
      output,
      resolvedPath: canonicalPath,
      canonicalPath,
      lexicalPath,
      content: await env.readArtifact(canonicalPath),
      version: releaseData.version,
    };
  });
  return requireObservation(observation);
}

function requireObservation<T>(observation: T | undefined): T {
  if (observation === undefined) throw new Error("Release-notes scenario produced no observation");
  return observation;
}
