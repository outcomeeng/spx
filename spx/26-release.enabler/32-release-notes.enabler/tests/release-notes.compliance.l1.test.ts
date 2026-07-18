import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";

import type { AgentRunRequest } from "@/agent/agent-runner";
import { RELEASE_PROMPT_JSON_INDENT } from "@/domains/release/prompt-data";
import {
  buildReleaseNotesPrompt,
  CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  CHANGELOG_PATH_DATA_BLOCK_OPEN,
  changelogVersionHeading,
  COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
  COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
  composeReleaseNotes,
  DEFAULT_CHANGELOG_PATH,
  RELEASE_NOTES_AGENT_MAX_TURNS,
  RELEASE_NOTES_AGENT_PERMISSION_MODE,
  RELEASE_NOTES_AGENT_TOOLS,
  RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_CLOSE,
  RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_OPEN,
  RELEASE_NOTES_USER_FACING_INSTRUCTION,
  RELEASE_VERSION_DATA_BLOCK_CLOSE,
  RELEASE_VERSION_DATA_BLOCK_OPEN,
  type ReleaseNotesConfig,
  ReleaseNotesError,
  resolveReleaseNotesPath,
} from "@/domains/release/release-notes";
import { isPathContained, PATH_CONTAINMENT_PARENT_DIRECTORY } from "@/lib/file-system/pathContainment";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import {
  arbitraryConfiguredChangelogPath,
  arbitraryConformantChangelog,
  arbitraryEscapingChangelogPath,
  arbitraryNestedConfiguredChangelogPath,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import {
  approvingReleaseNotesFaithfulnessAuditor,
  composeReleaseNotesInEnv,
  expectedCanonicalRelativeChangelogPath,
  recordingReleaseNotesAgent,
  sampleReleaseNotesCompositionFixture,
} from "@testing/harnesses/release/release-notes";
import {
  observeAbsoluteInTreeReleaseNotesPath,
  observeConfiguredReleaseNotesPathRejection,
  observeExistingReleaseNotesSection,
  observeReleaseNotesFaithfulness,
  observeReleaseNotesMutation,
  observeReleaseNotesPartialWriteFailure,
  observeReleaseNotesPathContainment,
  observeReleaseNotesSymlinkToRootPath,
  RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE,
  RELEASE_NOTES_EXISTING_SECTION_CASE,
  RELEASE_NOTES_FAITHFULNESS_CASE,
  RELEASE_NOTES_MUTATION_CASE,
} from "@testing/harnesses/release/release-notes-compliance";
import {
  RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  RELEASE_NOTES_FILE_SYMLINK_TYPE,
  RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
  withReleaseNotesEnv,
} from "@testing/harnesses/release/release-notes-env";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { describe, expect, it } from "vitest";

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

function parsedPromptJsonBlock(prompt: string, openMarker: string, closeMarker: string): string {
  return JSON.stringify(
    JSON.parse(promptDataBlock(prompt, openMarker, closeMarker)) as string | readonly string[],
    null,
    RELEASE_PROMPT_JSON_INDENT,
  );
}

function promptPathData(prompt: string): string {
  return JSON.parse(promptDataBlock(
    prompt,
    CHANGELOG_PATH_DATA_BLOCK_OPEN,
    CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  )) as string;
}

it("instructs the producer to describe user-visible release behavior", () => {
  expect(buildReleaseNotesPrompt(
    sampleReleaseNotesCompositionFixture().releaseData,
    DEFAULT_CHANGELOG_PATH,
  )).toContain(RELEASE_NOTES_USER_FACING_INSTRUCTION);
});

describe("composeReleaseNotes builds the prompt from the release data and resolved configuration", () => {
  it("includes the release version, the commit subjects, and the checked canonical staged path as prompt data", async () => {
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
        const recordingAgentRunner = recordingReleaseNotesAgent(
          workingDirectory,
          resolvedPath,
          conformant,
        );
        let checkedStagedPromptPath: string | undefined;
        const agentRunner = {
          get lastPrompt() {
            return recordingAgentRunner.lastPrompt;
          },
          get requests() {
            return recordingAgentRunner.requests;
          },
          async run(request: AgentRunRequest) {
            const stagedPath = promptPathData(request.prompt);
            expect(await canonicalizePath(request.workingDirectory)).toBe(request.workingDirectory);
            checkedStagedPromptPath = join(request.workingDirectory, DEFAULT_CHANGELOG_PATH);
            expect(stagedPath).toBe(checkedStagedPromptPath);
            await recordingAgentRunner.run(request);
          },
        };

        await composeReleaseNotesInEnv(env, {
          releaseData,
          config,
          agentRunner,
        });

        const prompt = agentRunner.lastPrompt;
        const parsedVersionBlock = parsedPromptJsonBlock(
          prompt,
          RELEASE_VERSION_DATA_BLOCK_OPEN,
          RELEASE_VERSION_DATA_BLOCK_CLOSE,
        );
        expect(parsedVersionBlock).toBe(
          JSON.stringify(releaseData.version, null, RELEASE_PROMPT_JSON_INDENT),
        );
        const parsedSubjectBlock = parsedPromptJsonBlock(
          prompt,
          COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
          COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
        );
        expect(parsedSubjectBlock).toBe(
          JSON.stringify(subjects, null, RELEASE_PROMPT_JSON_INDENT),
        );
        const stagedPromptPath = promptPathData(prompt);
        expect(stagedPromptPath).not.toBe(expectedCanonicalPath);
        expect(checkedStagedPromptPath).toBe(stagedPromptPath);
        const request = agentRunner.requests[0];
        expect(isPathContained(request.workingDirectory, stagedPromptPath)).toBe(true);
        expect(request.tools).toEqual(RELEASE_NOTES_AGENT_TOOLS);
        expect(request.allowedTools).toEqual(RELEASE_NOTES_AGENT_TOOLS);
        expect(request.permissionMode).toBe(RELEASE_NOTES_AGENT_PERMISSION_MODE);
        expect(request.maxTurns).toBe(RELEASE_NOTES_AGENT_MAX_TURNS);
        await expect(canonicalizePath(request.workingDirectory)).resolves.toBeUndefined();
        expect(prompt).not.toContain(`version ${releaseData.version}`);
        expect(prompt).not.toContain(`at ${resolvedPath}`);
      },
    );
  });

  it("instructs the agent to preserve existing changelog sections", async () => {
    await expect(
      observeExistingReleaseNotesSection(RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION),
    ).resolves.toSatisfy((observation) => {
      expect(observation.stagedPromptPath).not.toBe(observation.expectedCanonicalPath);
      expect(isPathContained(observation.promptWorkingDirectory, observation.stagedPromptPath)).toBe(true);
      expect(observation.prompt).toContain(observation.preservationInstruction);
      return true;
    });
  });

  it("rejects generated notes that delete an existing version section", async () => {
    await expect(
      observeExistingReleaseNotesSection(RELEASE_NOTES_EXISTING_SECTION_CASE.DELETED_SECTION),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.stagedCanonicalPath).toBe(observation.stagedPromptPath);
      expect(observation.stagedInput).toBe(observation.expectedFinalContent);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("rejects generated notes that copy an existing version section into a code fence", async () => {
    await expect(
      observeExistingReleaseNotesSection(RELEASE_NOTES_EXISTING_SECTION_CASE.FENCED_SECTION),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("accepts generated notes that preserve existing sections while updating footer references", async () => {
    await expect(
      observeExistingReleaseNotesSection(RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.result).toEqual(observation.expectedResult);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("rejects generated notes that truncate an existing fenced reference-definition section", async () => {
    await expect(
      observeExistingReleaseNotesSection(RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_FENCED_REFERENCES),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("rejects generated notes that truncate an existing section after an in-section reference definition", async () => {
    await expect(
      observeExistingReleaseNotesSection(RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_IN_SECTION_REFERENCE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("accepts generated notes that preserve an existing section after an in-section reference definition", async () => {
    await expect(
      observeExistingReleaseNotesSection(RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.result).toEqual(observation.expectedResult);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("uses a checked canonical staged path in the prompt when a symlink ancestor is followed by parent traversal", async () => {
    await withReleaseNotesEnv(
      async ({
        workingDirectory,
        readArtifact,
        createArtifactStage,
        promoteArtifact,
        canonicalizePath,
        isSymbolicLink,
        isFile,
      }) => {
        const releaseData = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseData(),
        );
        const subjects = releaseData.commits.map((commit) => commit.subject);
        const [actualSegment, childSegment, symlinkSegment] = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
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
          createArtifactStage,
          promoteArtifact,
          faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
          canonicalizePath,
          isSymbolicLink,
          isFile,
        });

        const stagedPromptPath = promptPathData(agentRunner.lastPrompt);
        expect(stagedPromptPath).not.toBe(
          await canonicalizePath(canonicalArtifactPath),
        );
        expect(isPathContained(agentRunner.requests[0].workingDirectory, stagedPromptPath)).toBe(true);
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
        expect(parsedPromptJsonBlock(
          prompt,
          RELEASE_VERSION_DATA_BLOCK_OPEN,
          RELEASE_VERSION_DATA_BLOCK_CLOSE,
        )).toBe(
          JSON.stringify(releaseData.version, null, RELEASE_PROMPT_JSON_INDENT),
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
        expect(parsedPromptJsonBlock(
          prompt,
          COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
          COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
        )).toBe(
          JSON.stringify(subjects, null, RELEASE_PROMPT_JSON_INDENT),
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
        const stagedPromptPath = promptPathData(prompt);
        expect(stagedPromptPath).not.toBe(expectedCanonicalPath);
        expect(isPathContained(agentRunner.requests[0].workingDirectory, stagedPromptPath)).toBe(true);
      },
    );
  });

  it("uses a checked canonical staged path for an absolute in-tree configured changelog", async () => {
    await expect(observeAbsoluteInTreeReleaseNotesPath()).resolves.toSatisfy((observation) => {
      expect(observation.stagedPromptPath).not.toBe(observation.expectedCanonicalPath);
      expect(isPathContained(observation.promptWorkingDirectory, observation.stagedPromptPath)).toBe(true);
      expect(observation.readBackPath).toBe(observation.expectedCanonicalPath);
      expect(observation.finalContent).toBe(observation.expectedContent);
      return true;
    });
  });
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
          RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
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
          RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
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

  it("rejects an in-tree symlink retarget after the agent writes the staged artifact before promotion", async () => {
    await withReleaseNotesEnv(
      async (env) => {
        const { workingDirectory, readArtifact, canonicalizePath } = env;
        const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
        const [actualSegment, symlinkSegment, replacementSegment] = sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
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
        expect(await canonicalizePath(actualArtifactPath)).toBeUndefined();
        expect(
          await readArtifact(
            replacementArtifactPath,
            await canonicalizePath(replacementArtifactPath),
          ),
        ).toBe(replacementConformant);
      },
    );
  });

  it("rejects a staged artifact symlink swap before staged read-back", async () => {
    await expect(
      observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.STAGED_ARTIFACT_SYMLINK),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.mutationAttempted).toBe(true);
      expect(observation.actualCanonicalPath).toBeUndefined();
      return true;
    });
  });

  it("rejects notes that fail the faithfulness audit before promotion", async () => {
    await expect(observeReleaseNotesFaithfulness(RELEASE_NOTES_FAITHFULNESS_CASE.REJECTION)).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.auditAttempted).toBe(true);
        expect(observation.actualReleaseData).toBe(observation.expectedReleaseData);
        expect(observation.auditedSection).toContain(changelogVersionHeading(observation.expectedReleaseData.version));
        expect(observation.promotionAttempted).toBe(false);
        expect(observation.canonicalOutputPath).toBeUndefined();
        return true;
      },
    );
  });

  it("audits only the current release section when prior sections are preserved", async () => {
    await expect(
      observeReleaseNotesFaithfulness(RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.auditedSection?.trimEnd()).toBe(observation.expectedCurrentSection);
      expect(observation.auditedSection).not.toContain(observation.priorVersion);
      expect(observation.auditedSection).not.toContain(observation.preservedInstructionLikeText);
      expect(observation.finalContent).toBe(observation.expectedFinalContent);
      return true;
    });
  });

  it("passes the audited release section as JSON data to the production faithfulness auditor", async () => {
    await expect(
      observeReleaseNotesFaithfulness(RELEASE_NOTES_FAITHFULNESS_CASE.PRODUCTION_AUDITOR),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeUndefined();
      expect(observation.auditRequest?.workingDirectory).toBe(observation.workingDirectory);
      expect(JSON.parse(promptDataBlock(
        observation.auditPrompt,
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_OPEN,
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_CLOSE,
      ))).toBe(observation.productionAuditSection);
      return true;
    });
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
              RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
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

  it("preserves the existing changelog when atomic promotion cannot finish its temporary write", async () => {
    await expect(observeReleaseNotesPartialWriteFailure()).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.finalContent).toBe(observation.expectedContent);
      expect(observation.directoryEntries).toEqual(observation.expectedDirectoryEntries);
      return true;
    });
  });

  it("rejects a checked canonical path swapped to a final symlink before accepting promotion", async () => {
    await expect(observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.FINAL_SYMLINK)).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.mutationAttempted).toBe(true);
        expect(observation.actualCanonicalPath).toBe(observation.expectedCanonicalPath);
        return true;
      },
    );
  });

  it("rejects an ancestor directory swap before accepting promotion", async () => {
    await expect(observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.ANCESTOR_READ)).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.mutationAttempted).toBe(true);
        expect(observation.actualCanonicalPath).toBe(observation.expectedCanonicalPath);
        return true;
      },
    );
  });

  it("rejects an ancestor directory swap before final promotion opens the target", async () => {
    await expect(observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.PROMOTION_OPEN)).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.mutationAttempted).toBe(true);
        expect(observation.actualCanonicalPath).toBe(observation.expectedCanonicalPath);
        expect(observation.outsideContent).toBe(observation.expectedOutsideContent);
        return true;
      },
    );
  });

  it("rejects an ancestor directory swap before final promotion writes", async () => {
    await expect(observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.FINAL_WRITE)).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.mutationAttempted).toBe(true);
        expect(observation.actualCanonicalPath).toBe(observation.expectedCanonicalPath);
        expect(observation.outsideContent).toBe(observation.expectedOutsideContent);
        return true;
      },
    );
  });

  it("rejects an ancestor directory swap before creating a nested promotion parent", async () => {
    await expect(observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.DIRECTORY_CREATE)).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.mutationAttempted).toBe(true);
        expect(observation.outsideArtifactCanonicalPath).toBeUndefined();
        expect(observation.outsideChildDirectoryCanonicalPath).toBeUndefined();
        return true;
      },
    );
  });

  it("rejects an in-place changelog rewrite before read-back content is returned", async () => {
    await expect(observeReleaseNotesMutation(RELEASE_NOTES_MUTATION_CASE.IN_PLACE_REWRITE)).resolves.toSatisfy(
      (observation) => {
        expect(observation.error).toBeInstanceOf(ReleaseNotesError);
        expect(observation.mutationAttempted).toBe(true);
        return true;
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
    await expect(
      observeConfiguredReleaseNotesPathRejection(RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE.BLANK),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("rejects a configured changelog path that resolves to the working tree root", async () => {
    await expect(
      observeConfiguredReleaseNotesPathRejection(RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE.ROOT),
    ).resolves.toSatisfy((observation) => {
      expect(observation.error).toBeInstanceOf(ReleaseNotesError);
      expect(observation.agentRequestCount).toBe(0);
      return true;
    });
  });

  it("allows a configured changelog path whose symlink ancestor resolves to the working tree root", async () => {
    await expect(observeReleaseNotesSymlinkToRootPath()).resolves.toSatisfy((observation) => {
      expect(observation.result).toEqual(observation.expectedResult);
      expect(observation.agentRequestCount).toBe(1);
      return true;
    });
  });
});

describe("isPathContained verifies release path containment edge cases directly", () => {
  it("classifies generated POSIX and Windows containment boundaries", async () => {
    await expect(observeReleaseNotesPathContainment()).resolves.toSatisfy((observations) => {
      for (const observation of observations) expect(observation.actual).toBe(observation.expected);
      return true;
    });
  });
});
