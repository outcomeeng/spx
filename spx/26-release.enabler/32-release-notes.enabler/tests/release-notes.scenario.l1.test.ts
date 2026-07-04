import { isAbsolute } from "node:path";

import { describe, expect, it } from "vitest";

import { composeReleaseNotes, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import { isPathContained } from "@/lib/file-system/pathContainment";
import {
  arbitraryConfiguredChangelogPath,
  arbitraryConformantChangelog,
  oracleChangelogVersionHeading,
  oracleResolvedChangelogPath,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

describe("resolveReleaseNotesPath resolves the changelog within the product working tree", () => {
  it("resolves the default changelog within the working tree when no path is configured", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory }) => {
      const resolved = resolveReleaseNotesPath(workingDirectory, {});

      expect(isAbsolute(resolved)).toBe(true);
      expect(isPathContained(workingDirectory, resolved)).toBe(true);
      expect(resolved).toBe(oracleResolvedChangelogPath(workingDirectory, undefined));
    });
  });

  it("resolves a configured changelog path within the working tree", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory }) => {
      const changelogPath = sampleReleaseTestValue(arbitraryConfiguredChangelogPath());

      const resolved = resolveReleaseNotesPath(workingDirectory, { changelogPath });

      expect(isPathContained(workingDirectory, resolved)).toBe(true);
      expect(resolved).toBe(oracleResolvedChangelogPath(workingDirectory, changelogPath));
    });
  });
});

describe("composeReleaseNotes writes the changelog at the resolved path", () => {
  it("writes the changelog carrying a section for the release version", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact, canonicalizePath, isSymbolicLink }) => {
      const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
      const subjects = releaseData.commits.map((commit) => commit.subject);
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const changelogContent = sampleReleaseTestValue(
        arbitraryConformantChangelog(releaseData.version, subjects),
      );
      const agentRunner = new RecordingWritingAgentRunner(workingDirectory, resolvedPath, changelogContent);

      await composeReleaseNotes({
        releaseData,
        config,
        workingDirectory,
        agentRunner,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      });

      const written = await readArtifact(resolvedPath);
      expect(written).toContain(oracleChangelogVersionHeading(releaseData.version));
    });
  });
});
