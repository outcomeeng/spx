import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  composeReleaseNotes,
  DEFAULT_CHANGELOG_PATH,
  ReleaseNotesError,
  resolveReleaseNotesPath,
} from "@/domains/release/release-notes";
import { isPathContained } from "@/lib/file-system/pathContainment";
import {
  arbitraryConfiguredChangelogPath,
  arbitraryConformantChangelog,
  arbitraryEscapingChangelogPath,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

describe("composeReleaseNotes assembles the prompt only from release data and resolved config", () => {
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
      for (const subject of subjects) {
        expect(prompt).toContain(subject);
      }
      expect(prompt).toContain(resolvedPath);
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
});
