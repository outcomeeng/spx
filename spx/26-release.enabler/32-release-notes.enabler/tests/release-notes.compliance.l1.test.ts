import { join } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
  COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
  COMMIT_SUBJECTS_JSON_INDENT,
  composeReleaseNotes,
  decodeCommitSubjects,
  DEFAULT_CHANGELOG_PATH,
  ReleaseNotesError,
  resolveReleaseNotesPath,
} from "@/domains/release/release-notes";
import { isPathContained } from "@/lib/file-system/pathContainment";
import {
  arbitraryBlankConfiguredChangelogPath,
  arbitraryConfiguredChangelogPath,
  arbitraryConformantChangelog,
  arbitraryEscapingChangelogPath,
  arbitraryRootResolvingChangelogPath,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

describe("composeReleaseNotes builds the prompt from the release data and resolved configuration", () => {
  it("includes the release version, the commit subjects, and the resolved changelog path in the prompt", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));
      const agentRunner = new RecordingWritingAgentRunner(resolvedPath, conformant);

      await composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact });

      const prompt = agentRunner.lastPrompt;
      expect(prompt).toContain(releaseData.version);
      const blockStart = prompt.indexOf(COMMIT_SUBJECTS_DATA_BLOCK_OPEN);
      const blockEnd = prompt.indexOf(COMMIT_SUBJECTS_DATA_BLOCK_CLOSE);
      expect(blockStart).toBeGreaterThan(-1);
      expect(blockEnd).toBeGreaterThan(blockStart);
      const delimitedSubjectBlock = prompt.slice(blockStart + COMMIT_SUBJECTS_DATA_BLOCK_OPEN.length, blockEnd).trim();
      const decodedSubjectBlock = decodeCommitSubjects(delimitedSubjectBlock);
      expect(decodedSubjectBlock).toBe(JSON.stringify(subjects, null, COMMIT_SUBJECTS_JSON_INDENT));
      expect(prompt).toContain(resolvedPath);
    });
  });

  it("keeps delimiter-like commit subject text inside the encoded data block", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseDataWithSubjects([
        COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
      ]));
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));
      const agentRunner = new RecordingWritingAgentRunner(resolvedPath, conformant);

      await composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact });

      const prompt = agentRunner.lastPrompt;
      const blockStart = prompt.indexOf(COMMIT_SUBJECTS_DATA_BLOCK_OPEN);
      const blockEnd = prompt.indexOf(COMMIT_SUBJECTS_DATA_BLOCK_CLOSE);
      const delimitedSubjectBlock = prompt.slice(blockStart + COMMIT_SUBJECTS_DATA_BLOCK_OPEN.length, blockEnd).trim();
      expect(delimitedSubjectBlock).not.toContain(COMMIT_SUBJECTS_DATA_BLOCK_CLOSE);
      expect(decodeCommitSubjects(delimitedSubjectBlock)).toBe(
        JSON.stringify(subjects, null, COMMIT_SUBJECTS_JSON_INDENT),
      );
    });
  });
});

describe("composeReleaseNotes keeps the changelog path within the product working tree", () => {
  it("resolves a configured path inside the working tree and runs the agent there", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const changelogPath = sampleReleaseTestValue(arbitraryConfiguredChangelogPath());
      const config = { changelogPath };
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));
      const agentRunner = new RecordingWritingAgentRunner(resolvedPath, conformant);

      await composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact });

      expect(isPathContained(workingDirectory, resolvedPath)).toBe(true);
      expect(agentRunner.requests).toHaveLength(1);
    });
  });

  it("rejects a configured changelog path that escapes the working tree without invoking the agent", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const changelogPath = sampleReleaseTestValue(arbitraryEscapingChangelogPath());
      const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));
      // The double would write if invoked; the escape must be rejected before the agent runs.
      const agentRunner = new RecordingWritingAgentRunner(join(workingDirectory, DEFAULT_CHANGELOG_PATH), conformant);

      await expect(
        composeReleaseNotes({ releaseData, config: { changelogPath }, workingDirectory, agentRunner, readArtifact }),
      ).rejects.toThrow(ReleaseNotesError);
      expect(agentRunner.requests).toHaveLength(0);
    });
  });

  it("rejects a blank configured changelog path without invoking the agent", async () => {
    const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
    const subjects = releaseData.commits.map((commit) => commit.subject);
    const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));

    await fc.assert(
      fc.asyncProperty(arbitraryBlankConfiguredChangelogPath(), async (changelogPath) => {
        await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
          // The double would write if invoked; the blank path must be rejected before the agent runs.
          const agentRunner = new RecordingWritingAgentRunner(
            join(workingDirectory, DEFAULT_CHANGELOG_PATH),
            conformant,
          );

          await expect(
            composeReleaseNotes({
              releaseData,
              config: { changelogPath },
              workingDirectory,
              agentRunner,
              readArtifact,
            }),
          ).rejects.toThrow(ReleaseNotesError);
          expect(agentRunner.requests).toHaveLength(0);
        });
      }),
    );
  });

  it("rejects a configured changelog path that resolves to the working tree root", async () => {
    const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
    const subjects = releaseData.commits.map((commit) => commit.subject);
    const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));

    await fc.assert(
      fc.asyncProperty(arbitraryRootResolvingChangelogPath(), async (changelogPath) => {
        await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
          // The double would write if invoked; directory targets must be rejected before the agent runs.
          const agentRunner = new RecordingWritingAgentRunner(
            join(workingDirectory, DEFAULT_CHANGELOG_PATH),
            conformant,
          );

          await expect(
            composeReleaseNotes({
              releaseData,
              config: { changelogPath },
              workingDirectory,
              agentRunner,
              readArtifact,
            }),
          ).rejects.toThrow(ReleaseNotesError);
          expect(agentRunner.requests).toHaveLength(0);
        });
      }),
    );
  });
});
