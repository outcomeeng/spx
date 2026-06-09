import { describe, expect, it } from "vitest";

import { composeReleaseNotes, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import { arbitraryConformantChangelog, arbitraryNonConformantChangelog } from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

describe("composeReleaseNotes validates the read-back changelog against Keep a Changelog", () => {
  it("accepts a changelog that conforms to Keep a Changelog with a section for the version", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const conformant = sampleReleaseTestValue(arbitraryConformantChangelog(releaseData.version, subjects));
      const agentRunner = new RecordingWritingAgentRunner(resolvedPath, conformant);

      await expect(
        composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact }),
      ).resolves.toBeUndefined();
    });
  });

  it("rejects a changelog that does not conform to Keep a Changelog", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact }) => {
      const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const nonConformant = sampleReleaseTestValue(
        arbitraryNonConformantChangelog(releaseData.version, subjects),
      );
      const agentRunner = new RecordingWritingAgentRunner(resolvedPath, nonConformant);

      await expect(
        composeReleaseNotes({ releaseData, config, workingDirectory, agentRunner, readArtifact }),
      ).rejects.toThrow();
    });
  });
});
