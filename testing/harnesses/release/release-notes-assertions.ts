import { expect } from "vitest";

import type { ReleaseData } from "@/domains/release/release-data";
import {
  CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  CHANGELOG_PATH_DATA_BLOCK_OPEN,
  CHANGELOG_PRESERVATION_INSTRUCTION,
  COMMIT_SUBJECTS_JSON_INDENT,
  composeReleaseNotes,
  decodeReleaseNotesPromptData,
  ReleaseNotesError,
  resolveReleaseNotesPath,
} from "@/domains/release/release-notes";
import {
  arbitraryConformantChangelog,
  sampleH1BoundaryReleaseNotesChangelogCase,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

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

function promptDataBlock(prompt: string, open: string, close: string): string {
  const start = prompt.indexOf(open);
  const end = prompt.indexOf(close);
  return prompt.slice(start + open.length, end).trim();
}
