import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, sep, win32 } from "node:path";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  CHANGELOG_PATH_DATA_BLOCK_OPEN,
  COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
  COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
  COMMIT_SUBJECTS_JSON_INDENT,
  composeReleaseNotes,
  decodeReleaseNotesPromptData,
  DEFAULT_CHANGELOG_PATH,
  RELEASE_VERSION_DATA_BLOCK_CLOSE,
  RELEASE_VERSION_DATA_BLOCK_OPEN,
  type ReleaseNotesConfig,
  ReleaseNotesError,
  resolveReleaseNotesPath,
} from "@/domains/release/release-notes";
import {
  isPathContained,
  PATH_CONTAINMENT_PARENT_DIRECTORY,
  PATH_CONTAINMENT_ROOT_CANDIDATE,
} from "@/lib/file-system/pathContainment";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import {
  arbitraryBlankConfiguredChangelogPath,
  arbitraryConfiguredChangelogPath,
  arbitraryConformantChangelog,
  arbitraryEscapingChangelogPath,
  arbitraryNestedConfiguredChangelogPath,
  arbitraryRootResolvingChangelogPath,
  oracleResolvedChangelogPath,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import {
  RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  RELEASE_NOTES_FILE_SYMLINK_TYPE,
  RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
  withReleaseNotesEnv,
} from "@testing/harnesses/release/release-notes-env";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("composeReleaseNotes builds the prompt from the release data and resolved configuration", () => {
  it("includes the release version, the commit subjects, and the resolved changelog path as prompt data", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseData(),
        );
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const config: ReleaseNotesConfig = {};
        const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
        const expectedResolvedPath = oracleResolvedChangelogPath(
          workingDirectory,
          config.changelogPath,
        );
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
        });

        const prompt = agentRunner.lastPrompt;
        const delimitedVersionBlock = promptDataBlock(
          prompt,
          RELEASE_VERSION_DATA_BLOCK_OPEN,
          RELEASE_VERSION_DATA_BLOCK_CLOSE,
        );
        expect(decodeReleaseNotesPromptData(delimitedVersionBlock)).toBe(
          JSON.stringify(releaseData.version, null, COMMIT_SUBJECTS_JSON_INDENT),
        );
        const delimitedSubjectBlock = promptDataBlock(
          prompt,
          COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
          COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
        );
        const decodedSubjectBlock = decodeReleaseNotesPromptData(
          delimitedSubjectBlock,
        );
        expect(decodedSubjectBlock).toBe(
          JSON.stringify(subjects, null, COMMIT_SUBJECTS_JSON_INDENT),
        );
        const delimitedPathBlock = promptDataBlock(
          prompt,
          CHANGELOG_PATH_DATA_BLOCK_OPEN,
          CHANGELOG_PATH_DATA_BLOCK_CLOSE,
        );
        const decodedPathBlock = decodeReleaseNotesPromptData(delimitedPathBlock);
        expect(decodedPathBlock).toBe(
          JSON.stringify(
            expectedResolvedPath,
            null,
            COMMIT_SUBJECTS_JSON_INDENT,
          ),
        );
        expect(prompt).not.toContain(`version ${releaseData.version}`);
        expect(prompt).not.toContain(`at ${resolvedPath}`);
      },
    );
  });

  it("keeps delimiter-like release version text inside the encoded data block", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = {
          ...sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
          version: RELEASE_VERSION_DATA_BLOCK_CLOSE,
        };
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
        });

        const prompt = agentRunner.lastPrompt;
        const delimitedVersionBlock = promptDataBlock(
          prompt,
          RELEASE_VERSION_DATA_BLOCK_OPEN,
          RELEASE_VERSION_DATA_BLOCK_CLOSE,
        );
        expect(delimitedVersionBlock).not.toContain(
          RELEASE_VERSION_DATA_BLOCK_CLOSE,
        );
        expect(decodeReleaseNotesPromptData(delimitedVersionBlock)).toBe(
          JSON.stringify(releaseData.version, null, COMMIT_SUBJECTS_JSON_INDENT),
        );
        expect(prompt).not.toContain(`version ${releaseData.version}`);
      },
    );
  });

  it("keeps delimiter-like commit subject text inside the encoded data block", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseDataWithSubjects([
            COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
          ]),
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
        });

        const prompt = agentRunner.lastPrompt;
        const delimitedSubjectBlock = promptDataBlock(
          prompt,
          COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
          COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
        );
        expect(delimitedSubjectBlock).not.toContain(
          COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
        );
        expect(decodeReleaseNotesPromptData(delimitedSubjectBlock)).toBe(
          JSON.stringify(subjects, null, COMMIT_SUBJECTS_JSON_INDENT),
        );
      },
    );
  });

  it("keeps instruction-like changelog path text inside the encoded data block", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseData(),
        );
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const changelogPath = `${CHANGELOG_PATH_DATA_BLOCK_OPEN}${DEFAULT_CHANGELOG_PATH}`;
        const resolvedPath = resolveReleaseNotesPath(workingDirectory, {
          changelogPath,
        });
        const expectedResolvedPath = oracleResolvedChangelogPath(
          workingDirectory,
          changelogPath,
        );
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
          config: { changelogPath },
          workingDirectory,
          agentRunner,
          readArtifact,
          canonicalizePath,
          isSymbolicLink,
        });

        const prompt = agentRunner.lastPrompt;
        const delimitedPathBlock = promptDataBlock(
          prompt,
          CHANGELOG_PATH_DATA_BLOCK_OPEN,
          CHANGELOG_PATH_DATA_BLOCK_CLOSE,
        );
        expect(delimitedPathBlock).not.toContain(
          CHANGELOG_PATH_DATA_BLOCK_CLOSE,
        );
        expect(decodeReleaseNotesPromptData(delimitedPathBlock)).toBe(
          JSON.stringify(
            expectedResolvedPath,
            null,
            COMMIT_SUBJECTS_JSON_INDENT,
          ),
        );
      },
    );
  });
});

function promptDataBlock(
  prompt: string,
  openMarker: string,
  closeMarker: string,
): string {
  const blockStart = prompt.indexOf(openMarker);
  const blockEnd = prompt.indexOf(closeMarker);
  expect(blockStart).toBeGreaterThan(-1);
  expect(blockEnd).toBeGreaterThan(blockStart);
  return prompt.slice(blockStart + openMarker.length, blockEnd).trim();
}

describe("composeReleaseNotes keeps the changelog path within the product working tree", () => {
  it("resolves a configured path inside the working tree and runs the agent there", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseData(),
        );
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const changelogPath = sampleReleaseTestValue(
          arbitraryConfiguredChangelogPath(),
        );
        const config = { changelogPath };
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
        });

        expect(isPathContained(workingDirectory, resolvedPath)).toBe(true);
        expect(agentRunner.requests).toHaveLength(1);
      },
    );
  });

  it("creates notes at a configured nested path whose parent directory does not exist", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseData(),
        );
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const changelogPath = sampleReleaseTestValue(
          arbitraryNestedConfiguredChangelogPath(),
        );
        const config = { changelogPath };
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
        });

        await expect(readArtifact(resolvedPath)).resolves.toBe(conformant);
        expect(agentRunner.requests).toHaveLength(1);
      },
    );
  });

  it("reads back from the checked canonical path when an in-tree symlink is configured", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseData(),
        );
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const [actualSegment, symlinkSegment] = sampleReleaseTestValue(
          fc.tuple(arbitraryPathSegment(), arbitraryPathSegment())
            .filter(([first, second]) => first !== second),
        );
        const actualDirectory = join(workingDirectory, actualSegment);
        const symlinkPath = join(workingDirectory, symlinkSegment);
        const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
        const config = { changelogPath };
        const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
        const conformant = sampleReleaseTestValue(
          arbitraryConformantChangelog(releaseData.version, subjects),
        );
        const agentRunner = new RecordingWritingAgentRunner(
          workingDirectory,
          resolvedPath,
          conformant,
        );
        let readBackPath: string | undefined;
        await mkdir(actualDirectory);
        await symlink(
          actualDirectory,
          symlinkPath,
          RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
        );

        await composeReleaseNotes({
          releaseData,
          config,
          workingDirectory,
          agentRunner,
          readArtifact: async (path) => {
            readBackPath = path;
            return await readArtifact(path);
          },
          canonicalizePath,
          isSymbolicLink,
        });

        expect(readBackPath).toBe(
          await canonicalizePath(join(actualDirectory, DEFAULT_CHANGELOG_PATH)),
        );
        expect(readBackPath).not.toBe(resolvedPath);
      },
    );
  });

  it("rejects a checked canonical path swapped to a final symlink before read-back completes", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        await withTempDir(
          RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
          async (outsideDirectory) => {
            const releaseData = sampleReleaseTestValue(
              RELEASE_TEST_GENERATOR.releaseData(),
            );
            const subjects = releaseData.commits.map(
              (commit) => commit.subject,
            );
            const [actualSegment, symlinkSegment] = sampleReleaseTestValue(
              fc.tuple(arbitraryPathSegment(), arbitraryPathSegment())
                .filter(([first, second]) => first !== second),
            );
            const actualDirectory = join(workingDirectory, actualSegment);
            const symlinkPath = join(workingDirectory, symlinkSegment);
            const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
            const config = { changelogPath };
            const resolvedPath = resolveReleaseNotesPath(
              workingDirectory,
              config,
            );
            const canonicalArtifactPath = join(
              actualDirectory,
              DEFAULT_CHANGELOG_PATH,
            );
            const outsideArtifactPath = join(
              outsideDirectory,
              DEFAULT_CHANGELOG_PATH,
            );
            const conformant = sampleReleaseTestValue(
              arbitraryConformantChangelog(releaseData.version, subjects),
            );
            const outsideConformant = sampleReleaseTestValue(
              arbitraryConformantChangelog(releaseData.version, subjects),
            );
            const agentRunner = new RecordingWritingAgentRunner(
              workingDirectory,
              resolvedPath,
              conformant,
            );
            let swappedReadCompleted = false;
            await mkdir(actualDirectory);
            await symlink(
              actualDirectory,
              symlinkPath,
              RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
            );
            await writeFile(outsideArtifactPath, outsideConformant);

            await expect(
              composeReleaseNotes({
                releaseData,
                config,
                workingDirectory,
                agentRunner,
                readArtifact: async (path) => {
                  await rm(path);
                  await symlink(
                    outsideArtifactPath,
                    path,
                    RELEASE_NOTES_FILE_SYMLINK_TYPE,
                  );
                  const content = await readArtifact(path);
                  swappedReadCompleted = true;
                  return content;
                },
                canonicalizePath,
                isSymbolicLink,
              }),
            ).rejects.toThrow();

            expect(swappedReadCompleted).toBe(false);
            expect(await canonicalizePath(canonicalArtifactPath)).toBe(
              await canonicalizePath(outsideArtifactPath),
            );
          },
        );
      },
    );
  });

  it("rejects a configured changelog path that escapes the working tree without invoking the agent", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseData(),
        );
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const changelogPath = sampleReleaseTestValue(
          arbitraryEscapingChangelogPath(),
        );
        const conformant = sampleReleaseTestValue(
          arbitraryConformantChangelog(releaseData.version, subjects),
        );
        // The double would write if invoked; the escape must be rejected before the agent runs.
        const agentRunner = new RecordingWritingAgentRunner(
          workingDirectory,
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
            canonicalizePath,
            isSymbolicLink,
          }),
        ).rejects.toThrow(ReleaseNotesError);
        expect(agentRunner.requests).toHaveLength(0);
      },
    );
  });

  it("rejects a configured changelog path through a symlink that escapes the working tree", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        await withTempDir(
          RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
          async (outsideDirectory) => {
            const releaseData = sampleReleaseTestValue(
              RELEASE_TEST_GENERATOR.releaseData(),
            );
            const subjects = releaseData.commits.map(
              (commit) => commit.subject,
            );
            const symlinkSegment = sampleReleaseTestValue(
              arbitraryPathSegment(),
            );
            const symlinkPath = join(workingDirectory, symlinkSegment);
            const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
            const conformant = sampleReleaseTestValue(
              arbitraryConformantChangelog(releaseData.version, subjects),
            );
            const agentRunner = new RecordingWritingAgentRunner(
              workingDirectory,
              join(workingDirectory, DEFAULT_CHANGELOG_PATH),
              conformant,
            );
            await symlink(
              outsideDirectory,
              symlinkPath,
              RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
            );

            await expect(
              composeReleaseNotes({
                releaseData,
                config: { changelogPath },
                workingDirectory,
                agentRunner,
                readArtifact,
                canonicalizePath,
                isSymbolicLink,
              }),
            ).rejects.toThrow(ReleaseNotesError);
            expect(agentRunner.requests).toHaveLength(0);
          },
        );
      },
    );
  });

  it("rejects a final changelog-path symlink with a missing outside target before invoking the agent", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        await withTempDir(
          RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
          async (outsideDirectory) => {
            const releaseData = sampleReleaseTestValue(
              RELEASE_TEST_GENERATOR.releaseData(),
            );
            const subjects = releaseData.commits.map(
              (commit) => commit.subject,
            );
            const config = {};
            const resolvedPath = resolveReleaseNotesPath(
              workingDirectory,
              config,
            );
            const outsideTarget = join(
              outsideDirectory,
              DEFAULT_CHANGELOG_PATH,
            );
            const conformant = sampleReleaseTestValue(
              arbitraryConformantChangelog(releaseData.version, subjects),
            );
            const agentRunner = new RecordingWritingAgentRunner(
              workingDirectory,
              resolvedPath,
              conformant,
            );
            await symlink(
              outsideTarget,
              resolvedPath,
              RELEASE_NOTES_FILE_SYMLINK_TYPE,
            );

            await expect(
              composeReleaseNotes({
                releaseData,
                config,
                workingDirectory,
                agentRunner,
                readArtifact,
                canonicalizePath,
                isSymbolicLink,
              }),
            ).rejects.toThrow(ReleaseNotesError);
            expect(agentRunner.requests).toHaveLength(0);
          },
        );
      },
    );
  });

  it("rejects a configured changelog path that traverses above a symlink target", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        canonicalizePath,
        isSymbolicLink,
      }) => {
        await withTempDir(
          RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
          async (outsideDirectory) => {
            const releaseData = sampleReleaseTestValue(
              RELEASE_TEST_GENERATOR.releaseData(),
            );
            const subjects = releaseData.commits.map(
              (commit) => commit.subject,
            );
            const symlinkSegment = sampleReleaseTestValue(
              arbitraryPathSegment(),
            );
            const symlinkPath = join(workingDirectory, symlinkSegment);
            const changelogPath = [
              symlinkSegment,
              PATH_CONTAINMENT_PARENT_DIRECTORY,
              DEFAULT_CHANGELOG_PATH,
            ].join(sep);
            const conformant = sampleReleaseTestValue(
              arbitraryConformantChangelog(releaseData.version, subjects),
            );
            const agentRunner = new RecordingWritingAgentRunner(
              workingDirectory,
              join(workingDirectory, DEFAULT_CHANGELOG_PATH),
              conformant,
            );
            await symlink(
              outsideDirectory,
              symlinkPath,
              RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
            );

            await expect(
              composeReleaseNotes({
                releaseData,
                config: { changelogPath },
                workingDirectory,
                agentRunner,
                readArtifact,
                canonicalizePath,
                isSymbolicLink,
              }),
            ).rejects.toThrow(ReleaseNotesError);
            expect(agentRunner.requests).toHaveLength(0);
          },
        );
      },
    );
  });

  it("rejects a blank configured changelog path without invoking the agent", async () => {
    const releaseData = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.releaseData(),
    );
    const subjects = releaseData.commits.map((commit) => commit.subject);
    const conformant = sampleReleaseTestValue(
      arbitraryConformantChangelog(releaseData.version, subjects),
    );

    await fc.assert(
      fc.asyncProperty(
        arbitraryBlankConfiguredChangelogPath(),
        async (changelogPath) => {
          await withReleaseNotesEnv(
            async ({
              workingDirectory,
              readArtifact,
              canonicalizePath,
              isSymbolicLink,
            }) => {
              // The double would write if invoked; the blank path must be rejected before the agent runs.
              const agentRunner = new RecordingWritingAgentRunner(
                workingDirectory,
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
                  canonicalizePath,
                  isSymbolicLink,
                }),
              ).rejects.toThrow(ReleaseNotesError);
              expect(agentRunner.requests).toHaveLength(0);
            },
          );
        },
      ),
    );
  });

  it("rejects a configured changelog path that resolves to the working tree root", async () => {
    const releaseData = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.releaseData(),
    );
    const subjects = releaseData.commits.map((commit) => commit.subject);
    const conformant = sampleReleaseTestValue(
      arbitraryConformantChangelog(releaseData.version, subjects),
    );

    await fc.assert(
      fc.asyncProperty(
        arbitraryRootResolvingChangelogPath(),
        async (changelogPath) => {
          await withReleaseNotesEnv(
            async ({
              workingDirectory,
              readArtifact,
              canonicalizePath,
              isSymbolicLink,
            }) => {
              // The double would write if invoked; directory targets must be rejected before the agent runs.
              const agentRunner = new RecordingWritingAgentRunner(
                workingDirectory,
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
                  canonicalizePath,
                  isSymbolicLink,
                }),
              ).rejects.toThrow(ReleaseNotesError);
              expect(agentRunner.requests).toHaveLength(0);
            },
          );
        },
      ),
    );
  });
});

describe("isPathContained verifies release path containment edge cases directly", () => {
  it("distinguishes parent traversal, root, prefix lookalikes, and absolute escapes", async () => {
    await withReleaseNotesEnv(async ({ workingDirectory }) => {
      const prefixLookalike = `${PATH_CONTAINMENT_PARENT_DIRECTORY}${sampleReleaseTestValue(arbitraryPathSegment())}`;
      const absoluteEscape = join(
        workingDirectory,
        PATH_CONTAINMENT_PARENT_DIRECTORY,
        DEFAULT_CHANGELOG_PATH,
      );

      expect(
        isPathContained(workingDirectory, PATH_CONTAINMENT_PARENT_DIRECTORY),
      ).toBe(false);
      expect(isPathContained(workingDirectory, prefixLookalike)).toBe(true);
      expect(
        isPathContained(workingDirectory, PATH_CONTAINMENT_ROOT_CANDIDATE),
      ).toBe(true);
      expect(isPathContained(workingDirectory, absoluteEscape)).toBe(false);
    });
  });

  it("rejects a Windows cross-drive candidate", () => {
    const root = win32.join(
      "C:\\",
      sampleReleaseTestValue(arbitraryPathSegment()),
    );
    const candidate = win32.join("D:\\", DEFAULT_CHANGELOG_PATH);

    expect(isPathContained(root, candidate)).toBe(false);
  });
});
