import { isAbsolute } from "node:path";

import { releaseNotesCommand } from "@/commands/release";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

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
import { approvingReleaseNotesFaithfulnessAuditor } from "@testing/harnesses/release/release-notes-assertions";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

export function registerReleaseNotesScenarioTests(): void {
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
      await withReleaseNotesEnv(
        async (
          {
            workingDirectory,
            readArtifact,
            createArtifactStage,
            promoteArtifact,
            canonicalizePath,
            isSymbolicLink,
            isFile,
          },
        ) => {
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
            createArtifactStage,
            promoteArtifact,
            faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
            canonicalizePath,
            isSymbolicLink,
            isFile,
          });

          const written = await readArtifact(resolvedPath);
          expect(written).toContain(oracleChangelogVersionHeading(releaseData.version));
        },
      );
    });
  });

  describe("releaseNotesCommand wires release-note composition into the release workflow", () => {
    it("writes the changelog through the production command handler", async () => {
      await withReleaseNotesEnv(async (env) => {
        const releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData());
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const config = {};
        const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, config);
        const changelogContent = sampleReleaseTestValue(
          arbitraryConformantChangelog(releaseData.version, subjects),
        );
        const agentRunner = new RecordingWritingAgentRunner(env.workingDirectory, resolvedPath, changelogContent);

        await expect(
          releaseNotesCommand({
            productDir: env.workingDirectory,
            config,
            releaseData,
            agentRunner,
            faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
            filesystem: env,
          }),
        ).resolves.toBe(`Generated release notes: ${resolvedPath}`);

        await expect(env.readArtifact(resolvedPath)).resolves.toContain(
          oracleChangelogVersionHeading(releaseData.version),
        );
      });
    });
  });
}

export const releaseNotesScenarioCases = collectHarnessTestCases(registerReleaseNotesScenarioTests);
