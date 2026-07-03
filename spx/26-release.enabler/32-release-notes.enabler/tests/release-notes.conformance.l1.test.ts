import { describe, expect, it } from "vitest";

import { composeReleaseNotes, ReleaseNotesError, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import {
  arbitraryConformantChangelog,
  conformantChangelogWithIndentedFenceText,
  nonConformantChangelogCases,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
const subjects = releaseData.commits.map((commit) => commit.subject);

describe("composeReleaseNotes validates the read-back changelog against Keep a Changelog", () => {
  it("accepts a changelog that conforms to Keep a Changelog with a section for the version", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));
      const agentRunner = new RecordingWritingAgentRunner(resolvedPath, conformant);

      await expect(
        composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact }),
      ).resolves.toBeUndefined();
    });
  });

  it("accepts literal fence text indented as code inside a conformant release section", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const conformant = conformantChangelogWithIndentedFenceText(releaseData.version, subjects);
      const agentRunner = new RecordingWritingAgentRunner(resolvedPath, conformant);

      await expect(
        composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact }),
      ).resolves.toBeUndefined();
    });
  });

  it.each(nonConformantChangelogCases(releaseData.version, subjects))(
    "rejects a changelog that $label",
    async ({ content }) => {
      await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
        const config = {};
        const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
        const agentRunner = new RecordingWritingAgentRunner(resolvedPath, content);

        await expect(
          composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact }),
        ).rejects.toThrow(ReleaseNotesError);
      });
    },
  );
});
