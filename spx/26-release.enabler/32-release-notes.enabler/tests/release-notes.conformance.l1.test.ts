import { describe, expect, it } from "vitest";

import { composeReleaseNotes, ReleaseNotesError, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import {
  sampleAtxClosingHashesReleaseNotesChangelogCase,
  sampleCdataReleaseNotesChangelogCase,
  sampleConformantReleaseNotesChangelogCase,
  sampleIndentedFenceReleaseNotesChangelogCase,
  sampleNonConformantReleaseNotesChangelogCases,
} from "@testing/generators/release/changelog";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { independentKeepAChangelogConformance } from "@testing/harnesses/release/keep-a-changelog-oracle";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

describe("composeReleaseNotes validates the read-back changelog against Keep a Changelog", () => {
  it("accepts a changelog that conforms to Keep a Changelog with a section for the version", async () => {
    const { releaseData, content } = sampleConformantReleaseNotesChangelogCase();

    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact, canonicalizePath, isSymbolicLink, isFile }) => {
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const agentRunner = new RecordingWritingAgentRunner(workingDirectory, resolvedPath, content);

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
      ).resolves.toBeUndefined();
      await expect(readArtifact(resolvedPath)).resolves.toSatisfy(
        (notes) => independentKeepAChangelogConformance(notes, releaseData.version),
      );
    });
  });

  it("accepts literal fence text indented as code inside a conformant release section", async () => {
    const { releaseData, content } = sampleIndentedFenceReleaseNotesChangelogCase();

    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact, canonicalizePath, isSymbolicLink, isFile }) => {
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const agentRunner = new RecordingWritingAgentRunner(workingDirectory, resolvedPath, content);

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
      ).resolves.toBeUndefined();
      await expect(readArtifact(resolvedPath)).resolves.toSatisfy(
        (notes) => independentKeepAChangelogConformance(notes, releaseData.version),
      );
    });
  });

  it("accepts legal ATX closing hashes on release and change-group headings", async () => {
    const { releaseData, content } = sampleAtxClosingHashesReleaseNotesChangelogCase();

    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact, canonicalizePath, isSymbolicLink, isFile }) => {
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const agentRunner = new RecordingWritingAgentRunner(workingDirectory, resolvedPath, content);

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
      ).resolves.toBeUndefined();
      await expect(readArtifact(resolvedPath)).resolves.toSatisfy(
        (notes) => independentKeepAChangelogConformance(notes, releaseData.version),
      );
    });
  });

  it("accepts literal CDATA text inside a conformant release section", async () => {
    const { releaseData, content } = sampleCdataReleaseNotesChangelogCase();

    await withReleaseNotesEnv(async ({ workingDirectory, readArtifact, canonicalizePath, isSymbolicLink, isFile }) => {
      const config = {};
      const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
      const agentRunner = new RecordingWritingAgentRunner(workingDirectory, resolvedPath, content);

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
      ).resolves.toBeUndefined();
      await expect(readArtifact(resolvedPath)).resolves.toSatisfy(
        (notes) => independentKeepAChangelogConformance(notes, releaseData.version),
      );
    });
  });

  for (const { releaseData, content, label } of sampleNonConformantReleaseNotesChangelogCases()) {
    it(`rejects a changelog that ${label}`, async () => {
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
    });
  }
});
