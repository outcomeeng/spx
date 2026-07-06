import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, sep, win32 } from "node:path";

import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import * as fc from "fast-check";

import type { AgentRunRequest } from "@/agent/agent-runner";
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
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import {
  assertAbsoluteInTreeConfiguredChangelogUsesCheckedCanonicalPath,
  assertReleaseNotesPromptPreservesExistingSections,
  composeReleaseNotesInEnv,
  expectedCanonicalRelativeChangelogPath,
  recordingReleaseNotesAgent,
  sampleReleaseNotesCompositionFixture,
} from "@testing/harnesses/release/release-notes-assertions";
import {
  RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  RELEASE_NOTES_FILE_SYMLINK_TYPE,
  RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
  withReleaseNotesEnv,
} from "@testing/harnesses/release/release-notes-env";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const WIN32_EXTENDED_LENGTH_C_DRIVE_ROOT = String.raw`\\?\C:` + win32.sep;
const WIN32_EXTENDED_LENGTH_D_DRIVE_ROOT = String.raw`\\?\D:` + win32.sep;

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

export function registerReleaseNotesComplianceTests(): void {
  describe("composeReleaseNotes builds the prompt from the release data and resolved configuration", () => {
    it("includes the release version, the commit subjects, and the checked canonical changelog path as prompt data", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, canonicalizePath } = env;
          const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
          const config: ReleaseNotesConfig = {};
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const expectedCanonicalPath = await expectedCanonicalRelativeChangelogPath(
            workingDirectory,
            config.changelogPath ?? DEFAULT_CHANGELOG_PATH,
            canonicalizePath,
          );
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config,
            agentRunner,
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
              expectedCanonicalPath,
              null,
              COMMIT_SUBJECTS_JSON_INDENT,
            ),
          );
          expect(prompt).not.toContain(`version ${releaseData.version}`);
          expect(prompt).not.toContain(`at ${resolvedPath}`);
        },
      );
    });

    it(
      "instructs the agent to preserve existing changelog sections",
      assertReleaseNotesPromptPreservesExistingSections,
    );

    it("uses the checked canonical changelog path in the prompt when a symlink ancestor is followed by parent traversal", async () => {
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
          const [actualSegment, childSegment, symlinkSegment] = sampleReleaseTestValue(
            fc.tuple(
              arbitraryPathSegment(),
              arbitraryPathSegment(),
              arbitraryPathSegment(),
            ).filter((segments) => new Set(segments).size === segments.length),
          );
          const actualDirectory = join(workingDirectory, actualSegment);
          const actualChildDirectory = join(actualDirectory, childSegment);
          const symlinkPath = join(workingDirectory, symlinkSegment);
          const changelogPath =
            `${symlinkSegment}${sep}${PATH_CONTAINMENT_PARENT_DIRECTORY}${sep}${DEFAULT_CHANGELOG_PATH}`;
          const config = { changelogPath };
          const lexicalResolvedPath = resolveReleaseNotesPath(
            workingDirectory,
            config,
          );
          const canonicalArtifactPath = join(
            actualDirectory,
            DEFAULT_CHANGELOG_PATH,
          );
          const conformant = sampleReleaseTestValue(
            arbitraryConformantChangelog(releaseData.version, subjects),
          );
          const agentRunner = new RecordingWritingAgentRunner(
            workingDirectory,
            canonicalArtifactPath,
            conformant,
          );
          await mkdir(actualChildDirectory, { recursive: true });
          await symlink(
            actualChildDirectory,
            symlinkPath,
            RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
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

          const delimitedPathBlock = promptDataBlock(
            agentRunner.lastPrompt,
            CHANGELOG_PATH_DATA_BLOCK_OPEN,
            CHANGELOG_PATH_DATA_BLOCK_CLOSE,
          );
          expect(decodeReleaseNotesPromptData(delimitedPathBlock)).toBe(
            JSON.stringify(
              await canonicalizePath(canonicalArtifactPath),
              null,
              COMMIT_SUBJECTS_JSON_INDENT,
            ),
          );
          expect(await canonicalizePath(canonicalArtifactPath)).not.toBe(
            lexicalResolvedPath,
          );
          expect(
            await readArtifact(
              canonicalArtifactPath,
              await canonicalizePath(canonicalArtifactPath),
            ),
          ).toBe(conformant);
        },
      );
    });

    it("keeps delimiter-like release version text inside the encoded data block", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const releaseData = {
            ...sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
            version: RELEASE_VERSION_DATA_BLOCK_CLOSE,
          };
          const { conformant } = sampleReleaseNotesCompositionFixture(releaseData);
          const config = {};
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config,
            agentRunner,
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
        async (env) => {
          const { workingDirectory } = env;
          const releaseData = sampleReleaseTestValue(
            RELEASE_TEST_GENERATOR.releaseDataWithSubjects([
              COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
            ]),
          );
          const { subjects, conformant } = sampleReleaseNotesCompositionFixture(releaseData);
          const config = {};
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config,
            agentRunner,
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
        async (env) => {
          const { workingDirectory, canonicalizePath } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const changelogPath = `${CHANGELOG_PATH_DATA_BLOCK_OPEN}${DEFAULT_CHANGELOG_PATH}`;
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, {
            changelogPath,
          });
          const expectedCanonicalPath = await expectedCanonicalRelativeChangelogPath(
            workingDirectory,
            changelogPath,
            canonicalizePath,
          );
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config: { changelogPath },
            agentRunner,
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
              expectedCanonicalPath,
              null,
              COMMIT_SUBJECTS_JSON_INDENT,
            ),
          );
        },
      );
    });

    it(
      "uses the checked canonical path for an absolute in-tree configured changelog",
      assertAbsoluteInTreeConfiguredChangelogUsesCheckedCanonicalPath,
    );
  });

  describe("composeReleaseNotes keeps the changelog path within the product working tree", () => {
    it("resolves a configured path inside the working tree and runs the agent there", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const changelogPath = sampleReleaseTestValue(
            arbitraryConfiguredChangelogPath(),
          );
          const config = { changelogPath };
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config,
            agentRunner,
          });

          expect(isPathContained(workingDirectory, resolvedPath)).toBe(true);
          expect(agentRunner.requests).toHaveLength(1);
        },
      );
    });

    it("creates notes at a configured nested path whose parent directory does not exist", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, readArtifact } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const changelogPath = sampleReleaseTestValue(
            arbitraryNestedConfiguredChangelogPath(),
          );
          const config = { changelogPath };
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config,
            agentRunner,
          });

          await expect(readArtifact(resolvedPath)).resolves.toBe(conformant);
          expect(agentRunner.requests).toHaveLength(1);
        },
      );
    });

    it("rejects a configured changelog path that already exists as a directory before invoking the agent", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const config = {};
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );
          await mkdir(resolvedPath);

          await expect(
            composeReleaseNotesInEnv(env, {
              releaseData,
              config,
              agentRunner,
            }),
          ).rejects.toThrow(ReleaseNotesError);
          expect(agentRunner.requests).toHaveLength(0);
        },
      );
    });

    it("rejects a configured changelog path below an existing file before invoking the agent", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const parentFileSegment = sampleReleaseTestValue(arbitraryPathSegment());
          const changelogPath = join(parentFileSegment, DEFAULT_CHANGELOG_PATH);
          const config = { changelogPath };
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );
          await writeFile(join(workingDirectory, parentFileSegment), conformant);

          await expect(
            composeReleaseNotesInEnv(env, {
              releaseData,
              config,
              agentRunner,
            }),
          ).rejects.toThrow(ReleaseNotesError);
          expect(agentRunner.requests).toHaveLength(0);
        },
      );
    });

    it("rejects a configured changelog path below a symlink to a file before invoking the agent", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const [actualFileSegment, symlinkSegment] = sampleReleaseTestValue(
            fc.tuple(arbitraryPathSegment(), arbitraryPathSegment())
              .filter(([first, second]) => first !== second),
          );
          const actualFilePath = join(workingDirectory, actualFileSegment);
          const symlinkPath = join(workingDirectory, symlinkSegment);
          const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
          const config = { changelogPath };
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );
          await writeFile(actualFilePath, conformant);
          await symlink(
            actualFilePath,
            symlinkPath,
            RELEASE_NOTES_FILE_SYMLINK_TYPE,
          );

          await expect(
            composeReleaseNotesInEnv(env, {
              releaseData,
              config,
              agentRunner,
            }),
          ).rejects.toThrow(ReleaseNotesError);
          expect(agentRunner.requests).toHaveLength(0);
        },
      );
    });

    it("reads back from the checked canonical path when an in-tree symlink is configured", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, readArtifact, canonicalizePath } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const [actualSegment, symlinkSegment] = sampleReleaseTestValue(
            fc.tuple(arbitraryPathSegment(), arbitraryPathSegment())
              .filter(([first, second]) => first !== second),
          );
          const actualDirectory = join(workingDirectory, actualSegment);
          const symlinkPath = join(workingDirectory, symlinkSegment);
          const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
          const config = { changelogPath };
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
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

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config,
            agentRunner,
            readArtifact: async (path) => {
              readBackPath = path;
              return await readArtifact(path);
            },
          });

          expect(readBackPath).toBe(
            await canonicalizePath(join(actualDirectory, DEFAULT_CHANGELOG_PATH)),
          );
          expect(readBackPath).not.toBe(resolvedPath);
        },
      );
    });

    it("accepts a missing default changelog when the working directory has a trailing separator", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, readArtifact, canonicalizePath } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const config: ReleaseNotesConfig = {};
          const trailingWorkingDirectory = `${workingDirectory}${sep}`;
          const resolvedPath = resolveReleaseNotesPath(
            trailingWorkingDirectory,
            config,
          );
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await composeReleaseNotesInEnv(env, {
            releaseData,
            config,
            workingDirectory: trailingWorkingDirectory,
            agentRunner,
          });

          expect(agentRunner.requests).toHaveLength(1);
          expect(
            await readArtifact(resolvedPath, await canonicalizePath(resolvedPath)),
          ).toBe(conformant);
        },
      );
    });

    it("rejects an in-tree symlink retarget after the agent writes before reading", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, readArtifact, canonicalizePath } = env;
          const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
          const [actualSegment, symlinkSegment, replacementSegment] = sampleReleaseTestValue(
            fc.tuple(
              arbitraryPathSegment(),
              arbitraryPathSegment(),
              arbitraryPathSegment(),
            ).filter((segments) => new Set(segments).size === segments.length),
          );
          const actualDirectory = join(workingDirectory, actualSegment);
          const symlinkPath = join(workingDirectory, symlinkSegment);
          const replacementDirectory = join(workingDirectory, replacementSegment);
          const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
          const config = { changelogPath };
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const actualArtifactPath = join(
            actualDirectory,
            DEFAULT_CHANGELOG_PATH,
          );
          const replacementArtifactPath = join(
            replacementDirectory,
            DEFAULT_CHANGELOG_PATH,
          );
          const replacementConformant = sampleReleaseTestValue(
            arbitraryConformantChangelog(releaseData.version, subjects),
          );
          const writingAgentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );
          const agentRunner = {
            async run(request: AgentRunRequest): Promise<void> {
              await writingAgentRunner.run(request);
              await rm(symlinkPath);
              await symlink(
                replacementDirectory,
                symlinkPath,
                RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
              );
            },
          };
          await mkdir(actualDirectory);
          await mkdir(replacementDirectory);
          await symlink(
            actualDirectory,
            symlinkPath,
            RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
          );
          await writeFile(replacementArtifactPath, replacementConformant);

          await expect(
            composeReleaseNotesInEnv(env, {
              releaseData,
              config,
              agentRunner,
            }),
          ).rejects.toThrow(ReleaseNotesError);

          expect(writingAgentRunner.requests).toHaveLength(1);
          expect(
            await readArtifact(
              actualArtifactPath,
              await canonicalizePath(actualArtifactPath),
            ),
          ).toBe(conformant);
          expect(
            await readArtifact(
              replacementArtifactPath,
              await canonicalizePath(replacementArtifactPath),
            ),
          ).toBe(replacementConformant);
        },
      );
    });

    it("rejects an ancestor directory swap during pre-agent revalidation without invoking the agent", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, canonicalizePath } = env;
          await withTempDir(
            RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
            async (outsideDirectory) => {
              const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
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
              const agentRunner = recordingReleaseNotesAgent(
                workingDirectory,
                resolvedPath,
                conformant,
              );
              let symlinkParentCanonicalizations = 0;
              await mkdir(actualDirectory);
              await symlink(
                actualDirectory,
                symlinkPath,
                RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
              );

              await expect(
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config,
                  agentRunner,
                  canonicalizePath: async (path) => {
                    if (path === symlinkPath) {
                      symlinkParentCanonicalizations += 1;
                      if (symlinkParentCanonicalizations === 1) {
                        await rm(symlinkPath);
                        await symlink(
                          outsideDirectory,
                          symlinkPath,
                          RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
                        );
                      }
                    }
                    return await canonicalizePath(path);
                  },
                }),
              ).rejects.toThrow(ReleaseNotesError);

              expect(agentRunner.requests).toHaveLength(0);
              expect(await canonicalizePath(resolvedPath)).toBeUndefined();
              expect(await canonicalizePath(symlinkPath)).toBe(
                await canonicalizePath(outsideDirectory),
              );
            },
          );
        },
      );
    });

    it("rejects a checked canonical path swapped to a final symlink before read-back completes", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, readArtifact, canonicalizePath } = env;
          await withTempDir(
            RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
            async (outsideDirectory) => {
              const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
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
              const outsideConformant = sampleReleaseTestValue(
                arbitraryConformantChangelog(releaseData.version, subjects),
              );
              const agentRunner = recordingReleaseNotesAgent(
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
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config,
                  agentRunner,
                  readArtifact: async (path, expectedCanonicalPath) => {
                    await rm(path);
                    await symlink(
                      outsideArtifactPath,
                      path,
                      RELEASE_NOTES_FILE_SYMLINK_TYPE,
                    );
                    const content = await readArtifact(
                      path,
                      expectedCanonicalPath,
                    );
                    swappedReadCompleted = true;
                    return content;
                  },
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

    it("rejects an ancestor directory swap before reading the opened artifact", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory, readArtifact, canonicalizePath } = env;
          await withTempDir(
            RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
            async (outsideDirectory) => {
              const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
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
              const outsideConformant = sampleReleaseTestValue(
                arbitraryConformantChangelog(releaseData.version, subjects),
              );
              const agentRunner = recordingReleaseNotesAgent(
                workingDirectory,
                resolvedPath,
                conformant,
              );
              let ancestorSwapReadCompleted = false;
              await mkdir(actualDirectory);
              await symlink(
                actualDirectory,
                symlinkPath,
                RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
              );
              await writeFile(outsideArtifactPath, outsideConformant);

              await expect(
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config,
                  agentRunner,
                  readArtifact: async (path, expectedCanonicalPath) => {
                    await rm(actualDirectory, { recursive: true });
                    await symlink(
                      outsideDirectory,
                      actualDirectory,
                      RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
                    );
                    const content = await readArtifact(
                      path,
                      expectedCanonicalPath,
                    );
                    ancestorSwapReadCompleted = true;
                    return content;
                  },
                }),
              ).rejects.toThrow(ReleaseNotesError);

              expect(ancestorSwapReadCompleted).toBe(false);
              expect(await canonicalizePath(canonicalArtifactPath)).toBe(
                await canonicalizePath(outsideArtifactPath),
              );
            },
          );
        },
      );
    });

    it("rejects an in-place changelog rewrite before read-back content is returned", async () => {
      const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
      let rewriteCompleted = false;

      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const config = {};
          const resolvedPath = resolveReleaseNotesPath(workingDirectory, config);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            resolvedPath,
            conformant,
          );

          await expect(
            composeReleaseNotesInEnv(env, {
              releaseData,
              config,
              agentRunner,
            }),
          ).rejects.toThrow(ReleaseNotesError);

          expect(rewriteCompleted).toBe(true);
        },
        {
          beforeArtifactRead: async (path) => {
            rewriteCompleted = true;
            await writeFile(path, `${conformant}${conformant}`);
          },
        },
      );
    });

    it("rejects a configured changelog path that escapes the working tree without invoking the agent", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
          const changelogPath = sampleReleaseTestValue(
            arbitraryEscapingChangelogPath(),
          );
          // The double would write if invoked; the escape must be rejected before the agent runs.
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            join(workingDirectory, DEFAULT_CHANGELOG_PATH),
            conformant,
          );

          await expect(
            composeReleaseNotesInEnv(env, {
              releaseData,
              config: { changelogPath },
              agentRunner,
            }),
          ).rejects.toThrow(ReleaseNotesError);
          expect(agentRunner.requests).toHaveLength(0);
        },
      );
    });

    it("rejects a configured changelog path through a symlink that escapes the working tree", async () => {
      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          await withTempDir(
            RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
            async (outsideDirectory) => {
              const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
              const symlinkSegment = sampleReleaseTestValue(
                arbitraryPathSegment(),
              );
              const symlinkPath = join(workingDirectory, symlinkSegment);
              const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
              const agentRunner = recordingReleaseNotesAgent(
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
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config: { changelogPath },
                  agentRunner,
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
        async (env) => {
          const { workingDirectory } = env;
          await withTempDir(
            RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
            async (outsideDirectory) => {
              const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
              const config = {};
              const resolvedPath = resolveReleaseNotesPath(
                workingDirectory,
                config,
              );
              const outsideTarget = join(
                outsideDirectory,
                DEFAULT_CHANGELOG_PATH,
              );
              const agentRunner = recordingReleaseNotesAgent(
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
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config,
                  agentRunner,
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
        async (env) => {
          const { workingDirectory } = env;
          await withTempDir(
            RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
            async (outsideDirectory) => {
              const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
              const symlinkSegment = sampleReleaseTestValue(
                arbitraryPathSegment(),
              );
              const symlinkPath = join(workingDirectory, symlinkSegment);
              const changelogPath = [
                symlinkSegment,
                PATH_CONTAINMENT_PARENT_DIRECTORY,
                DEFAULT_CHANGELOG_PATH,
              ].join(sep);
              const agentRunner = recordingReleaseNotesAgent(
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
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config: { changelogPath },
                  agentRunner,
                }),
              ).rejects.toThrow(ReleaseNotesError);
              expect(agentRunner.requests).toHaveLength(0);
            },
          );
        },
      );
    });

    it("rejects a blank configured changelog path without invoking the agent", async () => {
      const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();

      await assertProperty(
        arbitraryBlankConfiguredChangelogPath(),
        async (changelogPath) => {
          await withReleaseNotesEnv(
            async (env) => {
              const { workingDirectory } = env;
              // The double would write if invoked; the blank path must be rejected before the agent runs.
              const agentRunner = recordingReleaseNotesAgent(
                workingDirectory,
                join(workingDirectory, DEFAULT_CHANGELOG_PATH),
                conformant,
              );

              await expect(
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config: { changelogPath },
                  agentRunner,
                }),
              ).rejects.toThrow(ReleaseNotesError);
              expect(agentRunner.requests).toHaveLength(0);
            },
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("rejects a configured changelog path that resolves to the working tree root", async () => {
      const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();

      await assertProperty(
        arbitraryRootResolvingChangelogPath(),
        async (changelogPath) => {
          await withReleaseNotesEnv(
            async (env) => {
              const { workingDirectory } = env;
              // The double would write if invoked; directory targets must be rejected before the agent runs.
              const agentRunner = recordingReleaseNotesAgent(
                workingDirectory,
                join(workingDirectory, DEFAULT_CHANGELOG_PATH),
                conformant,
              );

              await expect(
                composeReleaseNotesInEnv(env, {
                  releaseData,
                  config: { changelogPath },
                  agentRunner,
                }),
              ).rejects.toThrow(ReleaseNotesError);
              expect(agentRunner.requests).toHaveLength(0);
            },
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("allows a configured changelog path whose symlink ancestor resolves to the working tree root", async () => {
      const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();

      await withReleaseNotesEnv(
        async (env) => {
          const { workingDirectory } = env;
          const symlinkSegment = sampleReleaseTestValue(
            arbitraryPathSegment(),
          );
          const symlinkPath = join(workingDirectory, symlinkSegment);
          const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
          const agentRunner = recordingReleaseNotesAgent(
            workingDirectory,
            join(workingDirectory, DEFAULT_CHANGELOG_PATH),
            conformant,
          );
          await symlink(
            workingDirectory,
            symlinkPath,
            RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
          );

          await expect(
            composeReleaseNotesInEnv(env, {
              releaseData,
              config: { changelogPath },
              agentRunner,
            }),
          ).resolves.toBeUndefined();
          expect(agentRunner.requests).toHaveLength(1);
        },
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

    it("rejects a Windows UNC candidate outside the share root", () => {
      const root = win32.join(
        String.raw`\\release-host\product`,
        sampleReleaseTestValue(arbitraryPathSegment()),
      );
      const candidate = win32.join(
        String.raw`\\outside-host\product`,
        DEFAULT_CHANGELOG_PATH,
      );

      expect(isPathContained(root, candidate)).toBe(false);
    });

    it("rejects a Windows extended-length drive candidate outside the root", () => {
      const root = win32.join(
        WIN32_EXTENDED_LENGTH_C_DRIVE_ROOT,
        sampleReleaseTestValue(arbitraryPathSegment()),
      );
      const candidate = win32.join(
        WIN32_EXTENDED_LENGTH_D_DRIVE_ROOT,
        DEFAULT_CHANGELOG_PATH,
      );

      expect(isPathContained(root, candidate)).toBe(false);
    });

    it("rejects a Windows extended-length UNC candidate outside the share root", () => {
      const root = win32.join(
        String.raw`\\?\UNC\release-host\product`,
        sampleReleaseTestValue(arbitraryPathSegment()),
      );
      const candidate = win32.join(
        String.raw`\\?\UNC\outside-host\product`,
        DEFAULT_CHANGELOG_PATH,
      );

      expect(isPathContained(root, candidate)).toBe(false);
    });

    it("treats a Windows-drive-shaped candidate under a POSIX root as a contained filename", async () => {
      await withReleaseNotesEnv(async ({ workingDirectory }) => {
        const candidate = win32.join("D:\\", DEFAULT_CHANGELOG_PATH);

        expect(isPathContained(workingDirectory, candidate)).toBe(true);
      });
    });
  });
}

export const releaseNotesComplianceCases = collectHarnessTestCases(registerReleaseNotesComplianceTests);
