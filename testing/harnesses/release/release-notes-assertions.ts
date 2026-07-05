import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { expect } from "vitest";

import type { ReleaseData } from "@/domains/release/release-data";
import {
  CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  CHANGELOG_PATH_DATA_BLOCK_OPEN,
  CHANGELOG_PRESERVATION_INSTRUCTION,
  COMMIT_SUBJECTS_JSON_INDENT,
  composeReleaseNotes,
  decodeReleaseNotesPromptData,
  type PathCanonicalizer,
  type ReleaseNotesConfig,
  ReleaseNotesError,
  resolveReleaseNotesPath,
} from "@/domains/release/release-notes";
import {
  arbitraryConformantChangelog,
  arbitraryNestedConfiguredChangelogPath,
  sampleH1BoundaryReleaseNotesChangelogCase,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import { type ReleaseNotesEnv, withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

type ReleaseNotesAgentRunner = Parameters<typeof composeReleaseNotes>[0]["agentRunner"];

export interface ReleaseNotesCompositionFixture {
  readonly releaseData: ReleaseData;
  readonly subjects: readonly string[];
  readonly conformant: string;
}

interface ComposeReleaseNotesInEnvOptions {
  readonly releaseData: ReleaseData;
  readonly config: ReleaseNotesConfig;
  readonly agentRunner: ReleaseNotesAgentRunner;
  readonly workingDirectory?: string;
  readonly readArtifact?: ReleaseNotesEnv["readArtifact"];
  readonly canonicalizePath?: PathCanonicalizer;
}

export function sampleReleaseNotesCompositionFixture(
  releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
): ReleaseNotesCompositionFixture {
  const subjects = releaseData.commits.map((commit) => commit.subject);
  return {
    releaseData,
    subjects,
    conformant: sampleReleaseTestValue(
      arbitraryConformantChangelog(releaseData.version, subjects),
    ),
  };
}

export async function composeReleaseNotesInEnv(
  env: ReleaseNotesEnv,
  {
    releaseData,
    config,
    agentRunner,
    workingDirectory = env.workingDirectory,
    readArtifact = env.readArtifact,
    canonicalizePath = env.canonicalizePath,
  }: ComposeReleaseNotesInEnvOptions,
): Promise<void> {
  await composeReleaseNotes({
    releaseData,
    config,
    workingDirectory,
    agentRunner,
    readArtifact,
    canonicalizePath,
    isSymbolicLink: env.isSymbolicLink,
    isFile: env.isFile,
  });
}

export function recordingReleaseNotesAgent(
  workingDirectory: string,
  targetPath: string,
  content: string,
): RecordingWritingAgentRunner {
  return new RecordingWritingAgentRunner(workingDirectory, targetPath, content);
}

export async function expectedCanonicalRelativeChangelogPath(
  workingDirectory: string,
  configuredPath: string,
  canonicalizePath: PathCanonicalizer,
): Promise<string> {
  const canonicalWorkingDirectory = await canonicalizePath(workingDirectory);
  if (canonicalWorkingDirectory === undefined) {
    throw new Error("Release-notes test working directory cannot be canonicalized");
  }
  return join(canonicalWorkingDirectory, configuredPath);
}

export async function assertAbsoluteInTreeConfiguredChangelogUsesCheckedCanonicalPath(): Promise<void> {
  await withReleaseNotesEnv(
    async (env) => {
      const { workingDirectory, readArtifact, canonicalizePath } = env;
      const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
      const relativeChangelogPath = sampleReleaseTestValue(
        arbitraryNestedConfiguredChangelogPath(),
      );
      const changelogPath = resolve(workingDirectory, relativeChangelogPath);
      await mkdir(dirname(changelogPath), { recursive: true });
      const config = { changelogPath };
      const expectedCanonicalPath = await expectedCanonicalExistingDirectoryPath(
        changelogPath,
        canonicalizePath,
      );
      const agentRunner = recordingReleaseNotesAgent(
        workingDirectory,
        expectedCanonicalPath,
        conformant,
      );
      let readBackPath: string | undefined;

      await composeReleaseNotesInEnv(env, {
        releaseData,
        config,
        agentRunner,
        readArtifact: async (path) => {
          readBackPath = path;
          return await readArtifact(path);
        },
      });

      const delimitedPathBlock = promptDataBlock(
        agentRunner.lastPrompt,
        CHANGELOG_PATH_DATA_BLOCK_OPEN,
        CHANGELOG_PATH_DATA_BLOCK_CLOSE,
      );
      expect(decodeReleaseNotesPromptData(delimitedPathBlock)).toBe(
        JSON.stringify(
          expectedCanonicalPath,
          null,
          COMMIT_SUBJECTS_JSON_INDENT,
        ),
      );
      expect(readBackPath).toBe(expectedCanonicalPath);
      await expect(readArtifact(expectedCanonicalPath)).resolves.toBe(conformant);
    },
  );
}

export async function assertReleaseNotesPromptPreservesExistingSections(): Promise<void> {
  await withReleaseNotesEnv(
    async ({
      workingDirectory,
      readArtifact,
      canonicalizePath,
      isSymbolicLink,
      isFile,
    }) => {
      const releaseData = sampleReleaseTestValue(
        RELEASE_TEST_GENERATOR.releaseData(),
      );
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const conformant = sampleReleaseTestValue(
        arbitraryConformantChangelog(releaseData.version, subjects),
      );
      const agentRunner = new RecordingWritingAgentRunner(
        workingDirectory,
        resolvedPath,
        conformant,
      );

      await composeReleaseNotes({
        releaseData,
        config,
        workingDirectory,
        agentRunner,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
        isFile,
      });

      const expectedCanonicalPath = await canonicalizePath(resolvedPath);
      const delimitedPathBlock = promptDataBlock(
        agentRunner.lastPrompt,
        CHANGELOG_PATH_DATA_BLOCK_OPEN,
        CHANGELOG_PATH_DATA_BLOCK_CLOSE,
      );
      expect(decodeReleaseNotesPromptData(delimitedPathBlock)).toBe(
        JSON.stringify(expectedCanonicalPath, null, COMMIT_SUBJECTS_JSON_INDENT),
      );
      expect(agentRunner.lastPrompt).toContain(CHANGELOG_PRESERVATION_INSTRUCTION);
    },
  );
}

export async function rejectChangelogWithH1BoundaryBeforeChangeGroup(): Promise<void> {
  await expectRejectedReleaseNotesReadBack(
    sampleH1BoundaryReleaseNotesChangelogCase(),
  );
}

export async function expectRejectedReleaseNotesReadBack({
  releaseData,
  content,
}: {
  readonly releaseData: ReleaseData;
  readonly content: string;
}): Promise<void> {
  await withReleaseNotesEnv(
    async ({ workingDirectory, readArtifact, canonicalizePath, isSymbolicLink, isFile }) => {
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const agentRunner = new RecordingWritingAgentRunner(workingDirectory, resolvedPath, content);
      expect(independentKeepAChangelogConformance(content, releaseData.version)).toBe(false);

      await expect(
        composeReleaseNotes({
          releaseData,
          config,
          workingDirectory,
          agentRunner,
          readArtifact,
          canonicalizePath,
          isSymbolicLink,
          isFile,
        }),
      ).rejects.toThrow(ReleaseNotesError);
    },
  );
}

async function expectedCanonicalExistingDirectoryPath(
  artifactPath: string,
  canonicalizePath: PathCanonicalizer,
): Promise<string> {
  const outputDirectory = dirname(artifactPath);
  const canonicalDirectory = await canonicalizePath(outputDirectory);
  if (canonicalDirectory === undefined) {
    throw new Error("Release-notes test output directory cannot be canonicalized");
  }
  return join(canonicalDirectory, basename(artifactPath));
}

function promptDataBlock(prompt: string, open: string, close: string): string {
  const start = prompt.indexOf(open);
  const end = prompt.indexOf(close);
  return prompt.slice(start + open.length, end).trim();
}
