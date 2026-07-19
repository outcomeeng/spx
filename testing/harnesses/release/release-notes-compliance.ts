import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep, win32 } from "node:path";

import type { AgentAuditor, AgentAuditRequest, AgentRunRequest } from "@/agent/agent-runner";
import type { ReleaseData } from "@/domains/release/release-data";
import {
  CHANGELOG_CHANGE_GROUPS,
  CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  CHANGELOG_PATH_DATA_BLOCK_OPEN,
  CHANGELOG_PRESERVATION_INSTRUCTION,
  CHANGELOG_TITLE,
  changelogEntry,
  changelogGroupHeading,
  changelogVersionHeading,
  COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
  COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
  composeReleaseNotes,
  createReleaseNotesFaithfulnessAuditor,
  DEFAULT_CHANGELOG_PATH,
  MARKDOWN_FENCE_BACKTICK_MARKER,
  RELEASE_NOTES_AGENT_MAX_TURNS,
  RELEASE_NOTES_AGENT_PERMISSION_MODE,
  RELEASE_NOTES_AGENT_TOOLS,
  RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_CLOSE,
  RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_OPEN,
  RELEASE_NOTES_FAITHFULNESS_APPROVED,
  RELEASE_NOTES_USER_FACING_INSTRUCTION,
  RELEASE_VERSION_DATA_BLOCK_CLOSE,
  RELEASE_VERSION_DATA_BLOCK_OPEN,
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
  changelogWithFencedReferenceDefinition,
  changelogWithFooterReferences,
  changelogWithInSectionReferenceDefinition,
  changelogWithPrependedReleaseAndFooterReferences,
  changelogWithPrependedReleaseAndInSectionReference,
  changelogWithPrependedReleaseAndTruncatedInSectionReference,
  changelogWithTruncatedFencedReferenceDefinitionSection,
} from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { promptChangelogPath, RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import {
  approvingReleaseNotesFaithfulnessAuditor,
  composeReleaseNotesInEnv,
  expectedCanonicalRelativeChangelogPath,
  recordingReleaseNotesAgent,
  sampleReleaseNotesCompositionFixture,
} from "@testing/harnesses/release/release-notes";
import {
  partialWriteFailureAtomicFileSystem,
  RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  RELEASE_NOTES_FILE_SYMLINK_TYPE,
  RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
  type ReleaseNotesEnv,
  withReleaseNotesEnv,
} from "@testing/harnesses/release/release-notes-env";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

export const RELEASE_NOTES_EXISTING_SECTION_CASE = {
  PROMPT_PRESERVATION: "prompt-preservation",
  DELETED_SECTION: "deleted-section",
  FENCED_SECTION: "fenced-section",
  UPDATED_FOOTER_REFERENCES: "updated-footer-references",
  TRUNCATED_FENCED_REFERENCES: "truncated-fenced-references",
  TRUNCATED_IN_SECTION_REFERENCE: "truncated-in-section-reference",
  PRESERVED_IN_SECTION_REFERENCE: "preserved-in-section-reference",
} as const;

type ReleaseNotesExistingSectionCase =
  (typeof RELEASE_NOTES_EXISTING_SECTION_CASE)[keyof typeof RELEASE_NOTES_EXISTING_SECTION_CASE];

export const RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE = {
  BLANK: "blank",
  ROOT: "root",
} as const;

type ReleaseNotesConfiguredPathRejectionCase =
  (typeof RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE)[keyof typeof RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE];

export const RELEASE_NOTES_FAITHFULNESS_CASE = {
  REJECTION: "rejection",
  CURRENT_SECTION: "current-section",
  PRODUCTION_AUDITOR: "production-auditor",
} as const;

type ReleaseNotesFaithfulnessCase =
  (typeof RELEASE_NOTES_FAITHFULNESS_CASE)[keyof typeof RELEASE_NOTES_FAITHFULNESS_CASE];

export const RELEASE_NOTES_MUTATION_CASE = {
  FINAL_SYMLINK: "final-symlink",
  ANCESTOR_READ: "ancestor-read",
  PROMOTION_OPEN: "promotion-open",
  FINAL_WRITE: "final-write",
  DIRECTORY_CREATE: "directory-create",
  IN_PLACE_REWRITE: "in-place-rewrite",
  STAGED_ARTIFACT_SYMLINK: "staged-artifact-symlink",
} as const;

type ReleaseNotesMutationCase = (typeof RELEASE_NOTES_MUTATION_CASE)[keyof typeof RELEASE_NOTES_MUTATION_CASE];

export const RELEASE_NOTES_PROMPT_CASE = {
  STANDARD_DATA: "standard-data",
  CANONICAL_PARENT_TRAVERSAL: "canonical-parent-traversal",
  DELIMITER_VERSION: "delimiter-version",
  DELIMITER_SUBJECT: "delimiter-subject",
  INSTRUCTION_PATH: "instruction-path",
} as const;

type ReleaseNotesPromptCase = (typeof RELEASE_NOTES_PROMPT_CASE)[keyof typeof RELEASE_NOTES_PROMPT_CASE];

export const RELEASE_NOTES_PATH_CASE = {
  CONFIGURED_INSIDE: "configured-inside",
  NESTED_MISSING_PARENT: "nested-missing-parent",
  EXISTING_DIRECTORY: "existing-directory",
  BELOW_FILE: "below-file",
  BELOW_FILE_SYMLINK: "below-file-symlink",
  SYMLINK_READBACK: "symlink-readback",
  TRAILING_SEPARATOR: "trailing-separator",
  RETARGET_AFTER_STAGE: "retarget-after-stage",
  PRE_AGENT_ANCESTOR_SWAP: "pre-agent-ancestor-swap",
  ESCAPING: "escaping",
  ESCAPING_SYMLINK: "escaping-symlink",
  DANGLING_FINAL_SYMLINK: "dangling-final-symlink",
  ABOVE_SYMLINK_TARGET: "above-symlink-target",
} as const;

type ReleaseNotesPathCase = (typeof RELEASE_NOTES_PATH_CASE)[keyof typeof RELEASE_NOTES_PATH_CASE];

export interface ReleaseNotesExistingSectionObservation {
  readonly error: unknown;
  readonly result: { readonly changelogPath: string } | undefined;
  readonly expectedResult: { readonly changelogPath: string } | undefined;
  readonly finalContent: string;
  readonly expectedFinalContent: string;
  readonly prompt: string;
  readonly stagedPromptPath: string;
  readonly expectedCanonicalPath: string | undefined;
  readonly promptWorkingDirectory: string;
  readonly stagedInput: string | undefined;
  readonly stagedCanonicalPath: string | undefined;
  readonly preservationInstruction: string;
}

export interface ReleaseNotesConfiguredPathRejectionObservation {
  readonly error: unknown;
  readonly agentRequestCount: number;
}

export interface ReleaseNotesAbsolutePathObservation {
  readonly stagedPromptPath: string;
  readonly expectedCanonicalPath: string;
  readonly promptWorkingDirectory: string;
  readonly readBackPath: string | undefined;
  readonly finalContent: string;
  readonly expectedContent: string;
}

export interface ReleaseNotesPathContainmentObservation {
  readonly actual: boolean;
  readonly expected: boolean;
}

export interface ReleaseNotesPartialWriteFailureObservation {
  readonly error: unknown;
  readonly finalContent: string;
  readonly expectedContent: string;
  readonly directoryEntries: readonly string[];
  readonly expectedDirectoryEntries: readonly string[];
}

export interface ReleaseNotesFaithfulnessObservation {
  readonly error: unknown;
  readonly result: { readonly changelogPath: string } | undefined;
  readonly auditAttempted: boolean;
  readonly promotionAttempted: boolean;
  readonly actualReleaseData: ReleaseData | undefined;
  readonly expectedReleaseData: ReleaseData;
  readonly auditedSection: string | undefined;
  readonly expectedCurrentSection: string;
  readonly priorVersion: string;
  readonly preservedInstructionLikeText: string;
  readonly finalContent: string | undefined;
  readonly expectedFinalContent: string | undefined;
  readonly canonicalOutputPath: string | undefined;
  readonly auditRequest: AgentAuditRequest | undefined;
  readonly auditPrompt: string;
  readonly auditSectionDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly workingDirectory: string;
  readonly productionAuditSection: string;
}

export interface ReleaseNotesMutationObservation {
  readonly error: unknown;
  readonly mutationAttempted: boolean;
  readonly actualCanonicalPath: string | undefined;
  readonly expectedCanonicalPath: string | undefined;
  readonly outsideContent: string | undefined;
  readonly expectedOutsideContent: string | undefined;
  readonly outsideArtifactPath: string | undefined;
  readonly outsideChildDirectoryPath: string | undefined;
  readonly outsideArtifactCanonicalPath: string | undefined;
  readonly outsideChildDirectoryCanonicalPath: string | undefined;
}

export interface ReleaseNotesSymlinkRootObservation {
  readonly result: { readonly changelogPath: string };
  readonly expectedResult: { readonly changelogPath: string };
  readonly agentRequestCount: number;
}

export interface ReleaseNotesPromptObservation {
  readonly prompt: string;
  readonly versionDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly subjectsDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly pathDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly releaseData: ReleaseData;
  readonly subjects: readonly string[];
  readonly stagedPromptPath: string;
  readonly expectedCanonicalPath: string | undefined;
  readonly checkedStagedPromptPath: string | undefined;
  readonly request: AgentRunRequest;
  readonly requestWorkingDirectoryCanonicalDuring: string | undefined;
  readonly requestWorkingDirectoryCanonicalAfter: string | undefined;
  readonly resolvedPath: string;
  readonly lexicalResolvedPath: string | undefined;
  readonly canonicalArtifactPath: string | undefined;
  readonly finalContent: string | undefined;
  readonly expectedContent: string;
  readonly expectedTools: readonly string[];
  readonly expectedPermissionMode: string;
  readonly expectedMaxTurns: number;
}

export interface ReleaseNotesPromptDataBlockObservation {
  readonly start: number;
  readonly end: number;
  readonly data: string;
}

export interface ReleaseNotesPathObservation {
  readonly error: unknown;
  readonly agentRequestCount: number;
  readonly workingDirectory: string;
  readonly resolvedPath: string;
  readonly resolvedPathContained: boolean;
  readonly finalContent: string | undefined;
  readonly expectedContent: string;
  readonly readBackPath: string | undefined;
  readonly expectedReadBackPath: string | undefined;
  readonly actualArtifactCanonicalPath: string | undefined;
  readonly replacementArtifactContent: string | undefined;
  readonly expectedReplacementArtifactContent: string | undefined;
  readonly symlinkCanonicalPath: string | undefined;
  readonly expectedSymlinkCanonicalPath: string | undefined;
}

export async function observeReleaseNotesPrompt(
  promptCase: ReleaseNotesPromptCase,
): Promise<ReleaseNotesPromptObservation> {
  if (promptCase === RELEASE_NOTES_PROMPT_CASE.CANONICAL_PARENT_TRAVERSAL) {
    return await observeCanonicalParentTraversalPrompt();
  }
  let observation: ReleaseNotesPromptObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const fixture = promptCase === RELEASE_NOTES_PROMPT_CASE.DELIMITER_VERSION
      ? sampleReleaseNotesCompositionFixture({
        ...sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
        version: RELEASE_VERSION_DATA_BLOCK_CLOSE,
      })
      : promptCase === RELEASE_NOTES_PROMPT_CASE.DELIMITER_SUBJECT
      ? sampleReleaseNotesCompositionFixture(
        sampleReleaseTestValue(
          RELEASE_TEST_GENERATOR.releaseDataWithSubjects([
            COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
          ]),
        ),
      )
      : sampleReleaseNotesCompositionFixture();
    const changelogPath = promptCase === RELEASE_NOTES_PROMPT_CASE.INSTRUCTION_PATH
      ? `${CHANGELOG_PATH_DATA_BLOCK_OPEN}${DEFAULT_CHANGELOG_PATH}`
      : undefined;
    const config = changelogPath === undefined ? {} : { changelogPath };
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, config);
    const expectedCanonicalPath = await expectedCanonicalRelativeChangelogPath(
      env.workingDirectory,
      changelogPath ?? DEFAULT_CHANGELOG_PATH,
      env.canonicalizePath,
    );
    const recordingAgentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      fixture.conformant,
    );
    let checkedStagedPromptPath: string | undefined;
    let requestWorkingDirectoryCanonicalDuring: string | undefined;
    const agentRunner = promptCase === RELEASE_NOTES_PROMPT_CASE.STANDARD_DATA
      ? {
        get lastPrompt() {
          return recordingAgentRunner.lastPrompt;
        },
        get requests() {
          return recordingAgentRunner.requests;
        },
        async run(request: AgentRunRequest) {
          requestWorkingDirectoryCanonicalDuring = await env.canonicalizePath(request.workingDirectory);
          checkedStagedPromptPath = promptChangelogPath(request.prompt);
          await recordingAgentRunner.run(request);
        },
      }
      : recordingAgentRunner;
    await composeReleaseNotesInEnv(env, {
      releaseData: fixture.releaseData,
      config,
      agentRunner,
    });
    const request = requiredAgentRequest(recordingAgentRunner.requests);
    const stagedPromptPath = requiredPromptChangelogPath(
      recordingAgentRunner.lastPrompt,
    );
    observation = {
      prompt: recordingAgentRunner.lastPrompt,
      versionDataBlock: observePromptDataBlock(
        recordingAgentRunner.lastPrompt,
        RELEASE_VERSION_DATA_BLOCK_OPEN,
        RELEASE_VERSION_DATA_BLOCK_CLOSE,
      ),
      subjectsDataBlock: observePromptDataBlock(
        recordingAgentRunner.lastPrompt,
        COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
        COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
      ),
      pathDataBlock: observePromptDataBlock(
        recordingAgentRunner.lastPrompt,
        CHANGELOG_PATH_DATA_BLOCK_OPEN,
        CHANGELOG_PATH_DATA_BLOCK_CLOSE,
      ),
      releaseData: fixture.releaseData,
      subjects: fixture.subjects,
      stagedPromptPath,
      expectedCanonicalPath,
      checkedStagedPromptPath,
      request,
      requestWorkingDirectoryCanonicalDuring,
      requestWorkingDirectoryCanonicalAfter: await env.canonicalizePath(
        request.workingDirectory,
      ),
      resolvedPath,
      lexicalResolvedPath: undefined,
      canonicalArtifactPath: undefined,
      finalContent: undefined,
      expectedContent: fixture.conformant,
      expectedTools: RELEASE_NOTES_AGENT_TOOLS,
      expectedPermissionMode: RELEASE_NOTES_AGENT_PERMISSION_MODE,
      expectedMaxTurns: RELEASE_NOTES_AGENT_MAX_TURNS,
    };
  });
  if (observation === undefined) {
    throw new Error("Release-notes prompt produced no observation");
  }
  return observation;
}

async function observeCanonicalParentTraversalPrompt(): Promise<ReleaseNotesPromptObservation> {
  let observation: ReleaseNotesPromptObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const releaseData = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.releaseData(),
    );
    const subjects = releaseData.commits.map((commit) => commit.subject);
    const [actualSegment, childSegment, symlinkSegment] = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    );
    const actualDirectory = join(env.workingDirectory, actualSegment);
    const actualChildDirectory = join(actualDirectory, childSegment);
    const symlinkPath = join(env.workingDirectory, symlinkSegment);
    const changelogPath = [
      symlinkSegment,
      PATH_CONTAINMENT_PARENT_DIRECTORY,
      DEFAULT_CHANGELOG_PATH,
    ].join(sep);
    const config = { changelogPath };
    const lexicalResolvedPath = resolveReleaseNotesPath(
      env.workingDirectory,
      config,
    );
    const canonicalArtifactPath = join(actualDirectory, DEFAULT_CHANGELOG_PATH);
    const conformant = sampleReleaseTestValue(
      arbitraryConformantChangelog(releaseData.version, subjects),
    );
    const agentRunner = new RecordingWritingAgentRunner(
      env.workingDirectory,
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
      workingDirectory: env.workingDirectory,
      agentRunner,
      readArtifact: env.readArtifact,
      createArtifactStage: env.createArtifactStage,
      promoteArtifact: env.promoteArtifact,
      faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
      canonicalizePath: env.canonicalizePath,
      isSymbolicLink: env.isSymbolicLink,
      isFile: env.isFile,
    });
    const request = requiredAgentRequest(agentRunner.requests);
    observation = {
      prompt: agentRunner.lastPrompt,
      versionDataBlock: observePromptDataBlock(
        agentRunner.lastPrompt,
        RELEASE_VERSION_DATA_BLOCK_OPEN,
        RELEASE_VERSION_DATA_BLOCK_CLOSE,
      ),
      subjectsDataBlock: observePromptDataBlock(
        agentRunner.lastPrompt,
        COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
        COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
      ),
      pathDataBlock: observePromptDataBlock(
        agentRunner.lastPrompt,
        CHANGELOG_PATH_DATA_BLOCK_OPEN,
        CHANGELOG_PATH_DATA_BLOCK_CLOSE,
      ),
      releaseData,
      subjects,
      stagedPromptPath: requiredPromptChangelogPath(agentRunner.lastPrompt),
      expectedCanonicalPath: await env.canonicalizePath(canonicalArtifactPath),
      checkedStagedPromptPath: undefined,
      request,
      requestWorkingDirectoryCanonicalDuring: undefined,
      requestWorkingDirectoryCanonicalAfter: undefined,
      resolvedPath: lexicalResolvedPath,
      lexicalResolvedPath,
      canonicalArtifactPath,
      finalContent: await env.readArtifact(
        canonicalArtifactPath,
        await env.canonicalizePath(canonicalArtifactPath),
      ),
      expectedContent: conformant,
      expectedTools: RELEASE_NOTES_AGENT_TOOLS,
      expectedPermissionMode: RELEASE_NOTES_AGENT_PERMISSION_MODE,
      expectedMaxTurns: RELEASE_NOTES_AGENT_MAX_TURNS,
    };
  });
  if (observation === undefined) {
    throw new Error("Canonical release-notes prompt produced no observation");
  }
  return observation;
}

function requiredAgentRequest(
  requests: readonly AgentRunRequest[],
): AgentRunRequest {
  const request = requests.at(0);
  if (request === undefined) {
    throw new Error("Release-notes agent was not invoked");
  }
  return request;
}

function requiredPromptChangelogPath(prompt: string): string {
  const changelogPath = promptChangelogPath(prompt);
  if (changelogPath === undefined) {
    throw new Error("Release-notes prompt omitted the staged changelog path");
  }
  return changelogPath;
}

function observePromptDataBlock(
  prompt: string,
  openMarker: string,
  closeMarker: string,
): ReleaseNotesPromptDataBlockObservation {
  const start = prompt.indexOf(openMarker);
  const end = prompt.indexOf(closeMarker);
  if (start < 0 || end < start) {
    return { start, end, data: prompt.slice(0, 0) };
  }
  return {
    start,
    end,
    data: prompt.slice(start + openMarker.length, end).trim(),
  };
}

export async function observeExistingReleaseNotesSection(
  existingSectionCase: ReleaseNotesExistingSectionCase,
): Promise<ReleaseNotesExistingSectionObservation> {
  let observation: ReleaseNotesExistingSectionObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    observation = await observeExistingReleaseNotesSectionInEnv(
      env,
      existingSectionCase,
    );
  });
  if (observation === undefined) {
    throw new Error("Existing release-notes section produced no observation");
  }
  return observation;
}

export async function observeConfiguredReleaseNotesPathRejection(
  rejectionCase: ReleaseNotesConfiguredPathRejectionCase,
): Promise<ReleaseNotesConfiguredPathRejectionObservation> {
  const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
  const changelogPath = sampleReleaseTestValue(
    rejectionCase === RELEASE_NOTES_CONFIGURED_PATH_REJECTION_CASE.BLANK
      ? arbitraryBlankConfiguredChangelogPath()
      : arbitraryRootResolvingChangelogPath(),
  );
  let observation: ReleaseNotesConfiguredPathRejectionObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      join(env.workingDirectory, DEFAULT_CHANGELOG_PATH),
      conformant,
    );
    let error: unknown;
    try {
      await composeReleaseNotesInEnv(env, {
        releaseData,
        config: { changelogPath },
        agentRunner,
      });
    } catch (caught) {
      error = caught;
    }
    observation = { error, agentRequestCount: agentRunner.requests.length };
  });
  if (observation === undefined) {
    throw new Error("Configured release-notes path produced no observation");
  }
  return observation;
}

export async function observeReleaseNotesPath(
  pathCase: ReleaseNotesPathCase,
): Promise<ReleaseNotesPathObservation> {
  const needsOutsideDirectory = pathCase === RELEASE_NOTES_PATH_CASE.PRE_AGENT_ANCESTOR_SWAP
    || pathCase === RELEASE_NOTES_PATH_CASE.ESCAPING_SYMLINK
    || pathCase === RELEASE_NOTES_PATH_CASE.DANGLING_FINAL_SYMLINK
    || pathCase === RELEASE_NOTES_PATH_CASE.ABOVE_SYMLINK_TARGET;
  let observation: ReleaseNotesPathObservation | undefined;
  if (needsOutsideDirectory) {
    await withTempDir(
      RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
      async (outsideDirectory) => {
        await withReleaseNotesEnv(async (env) => {
          observation = await observeReleaseNotesPathInEnv(
            env,
            pathCase,
            outsideDirectory,
          );
        });
      },
    );
  } else {
    await withReleaseNotesEnv(async (env) => {
      observation = await observeReleaseNotesPathInEnv(env, pathCase);
    });
  }
  if (observation === undefined) {
    throw new Error("Release-notes path produced no observation");
  }
  return observation;
}

async function observeReleaseNotesPathInEnv(
  env: ReleaseNotesEnv,
  pathCase: ReleaseNotesPathCase,
  outsideDirectory?: string,
): Promise<ReleaseNotesPathObservation> {
  const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
  if (pathCase === RELEASE_NOTES_PATH_CASE.CONFIGURED_INSIDE) {
    const changelogPath = sampleReleaseTestValue(
      arbitraryConfiguredChangelogPath(),
    );
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
      changelogPath,
    });
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await composeReleaseNotesInEnv(env, {
      releaseData,
      config: { changelogPath },
      agentRunner,
    });
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.NESTED_MISSING_PARENT) {
    const changelogPath = sampleReleaseTestValue(
      arbitraryNestedConfiguredChangelogPath(),
    );
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
      changelogPath,
    });
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await composeReleaseNotesInEnv(env, {
      releaseData,
      config: { changelogPath },
      agentRunner,
    });
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      {
        finalContent: await env.readArtifact(resolvedPath),
      },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.EXISTING_DIRECTORY) {
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await mkdir(resolvedPath);
    const error = await captureReleaseNotesError(
      composeReleaseNotesInEnv(env, { releaseData, config: {}, agentRunner }),
    );
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.BELOW_FILE) {
    const parentFileSegment = sampleReleaseTestValue(arbitraryPathSegment());
    const changelogPath = join(parentFileSegment, DEFAULT_CHANGELOG_PATH);
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
      changelogPath,
    });
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await writeFile(join(env.workingDirectory, parentFileSegment), conformant);
    const error = await captureReleaseNotesError(
      composeReleaseNotesInEnv(env, {
        releaseData,
        config: { changelogPath },
        agentRunner,
      }),
    );
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.BELOW_FILE_SYMLINK) {
    const [actualFileSegment, symlinkSegment] = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    );
    const actualFilePath = join(env.workingDirectory, actualFileSegment);
    const symlinkPath = join(env.workingDirectory, symlinkSegment);
    const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
      changelogPath,
    });
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await writeFile(actualFilePath, conformant);
    await symlink(actualFilePath, symlinkPath, RELEASE_NOTES_FILE_SYMLINK_TYPE);
    const error = await captureReleaseNotesError(
      composeReleaseNotesInEnv(env, {
        releaseData,
        config: { changelogPath },
        agentRunner,
      }),
    );
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.SYMLINK_READBACK) {
    const [actualSegment, symlinkSegment] = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    );
    const actualDirectory = join(env.workingDirectory, actualSegment);
    const symlinkPath = join(env.workingDirectory, symlinkSegment);
    const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
      changelogPath,
    });
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
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
      config: { changelogPath },
      agentRunner,
      readArtifact: async (path) => {
        readBackPath = path;
        return await env.readArtifact(path);
      },
    });
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      {
        readBackPath,
        expectedReadBackPath: await env.canonicalizePath(
          join(actualDirectory, DEFAULT_CHANGELOG_PATH),
        ),
      },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.TRAILING_SEPARATOR) {
    const trailingWorkingDirectory = `${env.workingDirectory}${sep}`;
    const resolvedPath = resolveReleaseNotesPath(trailingWorkingDirectory, {});
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await composeReleaseNotesInEnv(env, {
      releaseData,
      config: {},
      workingDirectory: trailingWorkingDirectory,
      agentRunner,
    });
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      {
        finalContent: await env.readArtifact(
          resolvedPath,
          await env.canonicalizePath(resolvedPath),
        ),
      },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.RETARGET_AFTER_STAGE) {
    return await observeReleaseNotesRetargetPath(
      env,
      releaseData,
      subjects,
      conformant,
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.PRE_AGENT_ANCESTOR_SWAP) {
    return await observeReleaseNotesPreAgentSwapPath(
      env,
      requiredOutsideDirectory(outsideDirectory),
      releaseData,
      conformant,
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.ESCAPING) {
    const changelogPath = sampleReleaseTestValue(
      arbitraryEscapingChangelogPath(),
    );
    const resolvedPath = join(env.workingDirectory, DEFAULT_CHANGELOG_PATH);
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    const error = await captureReleaseNotesError(
      composeReleaseNotesInEnv(env, {
        releaseData,
        config: { changelogPath },
        agentRunner,
      }),
    );
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.ESCAPING_SYMLINK) {
    const symlinkSegment = sampleReleaseTestValue(arbitraryPathSegment());
    const symlinkPath = join(env.workingDirectory, symlinkSegment);
    const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
    const resolvedPath = join(env.workingDirectory, DEFAULT_CHANGELOG_PATH);
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await symlink(
      requiredOutsideDirectory(outsideDirectory),
      symlinkPath,
      RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
    );
    const error = await captureReleaseNotesError(
      composeReleaseNotesInEnv(env, {
        releaseData,
        config: { changelogPath },
        agentRunner,
      }),
    );
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.DANGLING_FINAL_SYMLINK) {
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    );
    await symlink(
      join(requiredOutsideDirectory(outsideDirectory), DEFAULT_CHANGELOG_PATH),
      resolvedPath,
      RELEASE_NOTES_FILE_SYMLINK_TYPE,
    );
    const error = await captureReleaseNotesError(
      composeReleaseNotesInEnv(env, { releaseData, config: {}, agentRunner }),
    );
    return releaseNotesPathObservation(
      env,
      resolvedPath,
      conformant,
      agentRunner.requests.length,
      { error },
    );
  }
  const symlinkSegment = sampleReleaseTestValue(arbitraryPathSegment());
  const symlinkPath = join(env.workingDirectory, symlinkSegment);
  const changelogPath = [
    symlinkSegment,
    PATH_CONTAINMENT_PARENT_DIRECTORY,
    DEFAULT_CHANGELOG_PATH,
  ].join(sep);
  const resolvedPath = join(env.workingDirectory, DEFAULT_CHANGELOG_PATH);
  const agentRunner = recordingReleaseNotesAgent(
    env.workingDirectory,
    resolvedPath,
    conformant,
  );
  await symlink(
    requiredOutsideDirectory(outsideDirectory),
    symlinkPath,
    RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  );
  const error = await captureReleaseNotesError(
    composeReleaseNotesInEnv(env, {
      releaseData,
      config: { changelogPath },
      agentRunner,
    }),
  );
  return releaseNotesPathObservation(
    env,
    resolvedPath,
    conformant,
    agentRunner.requests.length,
    { error },
  );
}

async function observeReleaseNotesRetargetPath(
  env: ReleaseNotesEnv,
  releaseData: ReleaseData,
  subjects: readonly string[],
  conformant: string,
): Promise<ReleaseNotesPathObservation> {
  const [actualSegment, symlinkSegment, replacementSegment] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
  );
  const actualDirectory = join(env.workingDirectory, actualSegment);
  const symlinkPath = join(env.workingDirectory, symlinkSegment);
  const replacementDirectory = join(env.workingDirectory, replacementSegment);
  const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
  const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
    changelogPath,
  });
  const actualArtifactPath = join(actualDirectory, DEFAULT_CHANGELOG_PATH);
  const replacementArtifactPath = join(
    replacementDirectory,
    DEFAULT_CHANGELOG_PATH,
  );
  const replacementConformant = sampleReleaseTestValue(
    arbitraryConformantChangelog(releaseData.version, subjects),
  );
  const writingAgentRunner = recordingReleaseNotesAgent(
    env.workingDirectory,
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
  const error = await captureReleaseNotesError(
    composeReleaseNotesInEnv(env, {
      releaseData,
      config: { changelogPath },
      agentRunner,
    }),
  );
  return releaseNotesPathObservation(
    env,
    resolvedPath,
    conformant,
    writingAgentRunner.requests.length,
    {
      error,
      actualArtifactCanonicalPath: await env.canonicalizePath(actualArtifactPath),
      replacementArtifactContent: await env.readArtifact(
        replacementArtifactPath,
        await env.canonicalizePath(replacementArtifactPath),
      ),
      expectedReplacementArtifactContent: replacementConformant,
    },
  );
}

async function observeReleaseNotesPreAgentSwapPath(
  env: ReleaseNotesEnv,
  outsideDirectory: string,
  releaseData: ReleaseData,
  conformant: string,
): Promise<ReleaseNotesPathObservation> {
  const [actualSegment, symlinkSegment] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
  );
  const actualDirectory = join(env.workingDirectory, actualSegment);
  const symlinkPath = join(env.workingDirectory, symlinkSegment);
  const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
  const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
    changelogPath,
  });
  const agentRunner = recordingReleaseNotesAgent(
    env.workingDirectory,
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
  const error = await captureReleaseNotesError(
    composeReleaseNotesInEnv(env, {
      releaseData,
      config: { changelogPath },
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
        return await env.canonicalizePath(path);
      },
    }),
  );
  return releaseNotesPathObservation(
    env,
    resolvedPath,
    conformant,
    agentRunner.requests.length,
    {
      error,
      actualArtifactCanonicalPath: await env.canonicalizePath(resolvedPath),
      symlinkCanonicalPath: await env.canonicalizePath(symlinkPath),
      expectedSymlinkCanonicalPath: await env.canonicalizePath(outsideDirectory),
    },
  );
}

function releaseNotesPathObservation(
  env: ReleaseNotesEnv,
  resolvedPath: string,
  expectedContent: string,
  agentRequestCount: number,
  fields: Partial<ReleaseNotesPathObservation> = {},
): ReleaseNotesPathObservation {
  return {
    error: undefined,
    agentRequestCount,
    workingDirectory: env.workingDirectory,
    resolvedPath,
    resolvedPathContained: isPathContained(env.workingDirectory, resolvedPath),
    finalContent: undefined,
    expectedContent,
    readBackPath: undefined,
    expectedReadBackPath: undefined,
    actualArtifactCanonicalPath: undefined,
    replacementArtifactContent: undefined,
    expectedReplacementArtifactContent: undefined,
    symlinkCanonicalPath: undefined,
    expectedSymlinkCanonicalPath: undefined,
    ...fields,
  };
}

async function captureReleaseNotesError(
  operation: Promise<unknown>,
): Promise<unknown> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    return error;
  }
}

function requiredOutsideDirectory(
  outsideDirectory: string | undefined,
): string {
  if (outsideDirectory === undefined) {
    throw new Error("Release-notes path case requires an outside directory");
  }
  return outsideDirectory;
}

export async function observeAbsoluteInTreeReleaseNotesPath(): Promise<ReleaseNotesAbsolutePathObservation> {
  let observation: ReleaseNotesAbsolutePathObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
    const relativeChangelogPath = sampleReleaseTestValue(
      arbitraryNestedConfiguredChangelogPath(),
    );
    const changelogPath = resolve(env.workingDirectory, relativeChangelogPath);
    await mkdir(dirname(changelogPath), { recursive: true });
    const expectedCanonicalPath = await canonicalExistingDirectoryPath(
      changelogPath,
      env,
    );
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      expectedCanonicalPath,
      conformant,
    );
    let readBackPath: string | undefined;
    await composeReleaseNotesInEnv(env, {
      releaseData,
      config: { changelogPath },
      agentRunner,
      readArtifact: async (path) => {
        readBackPath = path;
        return await env.readArtifact(path);
      },
    });
    const stagedPromptPath = promptChangelogPath(agentRunner.lastPrompt);
    if (stagedPromptPath === undefined) {
      throw new Error("Release-notes prompt omitted the staged changelog path");
    }
    observation = {
      stagedPromptPath,
      expectedCanonicalPath,
      promptWorkingDirectory: agentRunner.requests.at(0)?.workingDirectory ?? env.workingDirectory,
      readBackPath,
      finalContent: await env.readArtifact(expectedCanonicalPath),
      expectedContent: conformant,
    };
  });
  if (observation === undefined) {
    throw new Error("Absolute release-notes path produced no observation");
  }
  return observation;
}

export async function observeReleaseNotesPathContainment(): Promise<
  readonly ReleaseNotesPathContainmentObservation[]
> {
  const observations: ReleaseNotesPathContainmentObservation[] = [];
  await withReleaseNotesEnv(async ({ workingDirectory }) => {
    const [segment] = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    );
    const absoluteEscape = join(
      workingDirectory,
      PATH_CONTAINMENT_PARENT_DIRECTORY,
      DEFAULT_CHANGELOG_PATH,
    );
    observations.push(
      {
        actual: isPathContained(
          workingDirectory,
          PATH_CONTAINMENT_PARENT_DIRECTORY,
        ),
        expected: false,
      },
      {
        actual: isPathContained(
          workingDirectory,
          `${PATH_CONTAINMENT_PARENT_DIRECTORY}${segment}`,
        ),
        expected: true,
      },
      {
        actual: isPathContained(
          workingDirectory,
          PATH_CONTAINMENT_ROOT_CANDIDATE,
        ),
        expected: true,
      },
      {
        actual: isPathContained(workingDirectory, absoluteEscape),
        expected: false,
      },
    );
    const [driveRoot] = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots(),
    );
    observations.push({
      actual: isPathContained(
        workingDirectory,
        join(workingDirectory, driveRoot, DEFAULT_CHANGELOG_PATH),
      ),
      expected: true,
    });
  });
  observations.push(
    windowsContainmentObservation(
      RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots(),
    ),
    windowsContainmentObservation(
      RELEASE_TEST_GENERATOR.distinctWindowsUncRoots(),
    ),
    windowsContainmentObservation(
      RELEASE_TEST_GENERATOR.distinctWindowsExtendedLengthDriveRoots(),
    ),
    windowsContainmentObservation(
      RELEASE_TEST_GENERATOR.distinctWindowsExtendedLengthUncRoots(),
    ),
  );
  return observations;
}

export async function observeReleaseNotesPartialWriteFailure(): Promise<ReleaseNotesPartialWriteFailureObservation> {
  const [existingContent, replacementContent] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctDomainLiteralPair(),
  );
  let observation: ReleaseNotesPartialWriteFailureObservation | undefined;
  await withReleaseNotesEnv(
    async (env) => {
      const targetPath = join(env.workingDirectory, DEFAULT_CHANGELOG_PATH);
      await writeFile(targetPath, existingContent);
      const targetCanonicalPath = await env.canonicalizePath(targetPath);
      if (targetCanonicalPath === undefined) {
        throw new Error("Atomic promotion target cannot be canonicalized");
      }
      let error: unknown;
      try {
        await env.promoteArtifact(
          targetCanonicalPath,
          targetCanonicalPath,
          replacementContent,
        );
      } catch (caught) {
        error = caught;
      }
      observation = {
        error,
        finalContent: await env.readArtifact(targetPath, targetCanonicalPath),
        expectedContent: existingContent,
        directoryEntries: await readdir(env.workingDirectory),
        expectedDirectoryEntries: [DEFAULT_CHANGELOG_PATH],
      };
    },
    { atomicWriteFileSystem: partialWriteFailureAtomicFileSystem() },
  );
  if (observation === undefined) {
    throw new Error("Partial release-notes write produced no observation");
  }
  return observation;
}

export async function observeReleaseNotesFaithfulness(
  faithfulnessCase: ReleaseNotesFaithfulnessCase,
): Promise<ReleaseNotesFaithfulnessObservation> {
  const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
  const priorVersion = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctSemverFrom(releaseData.version),
  );
  const currentSection = [
    changelogVersionHeading(releaseData.version),
    changelogGroupHeading(CHANGELOG_CHANGE_GROUPS[0]),
    changelogEntry(subjects.at(0) ?? releaseData.version),
  ].join("\n");
  const preservedInstructionLikeText =
    `${RELEASE_NOTES_USER_FACING_INSTRUCTION} ${RELEASE_NOTES_FAITHFULNESS_APPROVED}`;
  const priorSection = [
    changelogVersionHeading(priorVersion),
    changelogGroupHeading(CHANGELOG_CHANGE_GROUPS[0]),
    changelogEntry(preservedInstructionLikeText),
  ].join("\n");
  const existingNotes = [CHANGELOG_TITLE, priorSection].join("\n\n");
  const generatedNotes = [CHANGELOG_TITLE, currentSection, priorSection].join(
    "\n\n",
  );
  if (faithfulnessCase === RELEASE_NOTES_FAITHFULNESS_CASE.PRODUCTION_AUDITOR) {
    return await observeProductionFaithfulnessAudit(
      releaseData,
      currentSection,
      priorVersion,
      preservedInstructionLikeText,
    );
  }
  let observation: ReleaseNotesFaithfulnessObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    let error: unknown;
    let result: { readonly changelogPath: string } | undefined;
    let auditAttempted = false;
    let promotionAttempted = false;
    let actualReleaseData: ReleaseData | undefined;
    let auditedSection: string | undefined;
    if (faithfulnessCase === RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION) {
      await writeFile(resolvedPath, existingNotes);
    }
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      faithfulnessCase === RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION
        ? generatedNotes
        : conformant,
    );
    try {
      result = await composeReleaseNotesInEnv(env, {
        releaseData,
        config: {},
        agentRunner,
        faithfulnessAuditor: async (request) => {
          auditAttempted = true;
          actualReleaseData = request.releaseData;
          auditedSection = request.notes;
          if (faithfulnessCase === RELEASE_NOTES_FAITHFULNESS_CASE.REJECTION) {
            throw new ReleaseNotesError(
              "Generated release notes failed faithfulness audit",
            );
          }
        },
        promoteArtifact: faithfulnessCase === RELEASE_NOTES_FAITHFULNESS_CASE.REJECTION
          ? async () => {
            promotionAttempted = true;
          }
          : env.promoteArtifact,
      });
    } catch (caught) {
      error = caught;
    }
    observation = {
      error,
      result,
      auditAttempted,
      promotionAttempted,
      actualReleaseData,
      expectedReleaseData: releaseData,
      auditedSection,
      expectedCurrentSection: currentSection,
      priorVersion,
      preservedInstructionLikeText,
      finalContent: faithfulnessCase === RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION
        ? await env.readArtifact(resolvedPath)
        : undefined,
      expectedFinalContent: faithfulnessCase === RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION
        ? generatedNotes
        : undefined,
      canonicalOutputPath: await env.canonicalizePath(resolvedPath),
      auditRequest: undefined,
      auditPrompt: "",
      auditSectionDataBlock: observePromptDataBlock(
        "",
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_OPEN,
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_CLOSE,
      ),
      workingDirectory: env.workingDirectory,
      productionAuditSection: currentSection,
    };
  });
  if (observation === undefined) {
    throw new Error("Release-notes faithfulness produced no observation");
  }
  return observation;
}

async function observeProductionFaithfulnessAudit(
  releaseData: ReleaseData,
  currentSection: string,
  priorVersion: string,
  preservedInstructionLikeText: string,
): Promise<ReleaseNotesFaithfulnessObservation> {
  let observation: ReleaseNotesFaithfulnessObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    let auditRequest: AgentAuditRequest | undefined;
    const agentAuditor: AgentAuditor = {
      async audit(request) {
        auditRequest = request;
        return RELEASE_NOTES_FAITHFULNESS_APPROVED;
      },
    };
    let error: unknown;
    try {
      await createReleaseNotesFaithfulnessAuditor(
        agentAuditor,
        env.workingDirectory,
      )({
        releaseData,
        notes: currentSection,
      });
    } catch (caught) {
      error = caught;
    }
    observation = {
      error,
      result: undefined,
      auditAttempted: auditRequest !== undefined,
      promotionAttempted: false,
      actualReleaseData: releaseData,
      expectedReleaseData: releaseData,
      auditedSection: currentSection,
      expectedCurrentSection: currentSection,
      priorVersion,
      preservedInstructionLikeText,
      finalContent: undefined,
      expectedFinalContent: undefined,
      canonicalOutputPath: undefined,
      auditRequest,
      auditPrompt: auditRequest?.prompt ?? "",
      auditSectionDataBlock: observePromptDataBlock(
        auditRequest?.prompt ?? "",
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_OPEN,
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_CLOSE,
      ),
      workingDirectory: env.workingDirectory,
      productionAuditSection: currentSection,
    };
  });
  if (observation === undefined) {
    throw new Error("Production faithfulness audit produced no observation");
  }
  return observation;
}

export async function observeReleaseNotesMutation(
  mutationCase: ReleaseNotesMutationCase,
): Promise<ReleaseNotesMutationObservation> {
  if (mutationCase === RELEASE_NOTES_MUTATION_CASE.DIRECTORY_CREATE) {
    return await observeReleaseNotesDirectoryCreateMutation();
  }
  if (mutationCase === RELEASE_NOTES_MUTATION_CASE.IN_PLACE_REWRITE) {
    return await observeReleaseNotesRewriteMutation();
  }
  if (mutationCase === RELEASE_NOTES_MUTATION_CASE.STAGED_ARTIFACT_SYMLINK) {
    return await observeStagedArtifactSymlinkMutation();
  }
  let targetPathToSwap: string | undefined;
  let actualDirectoryToSwap: string | undefined;
  let outsideDirectoryToSwap: string | undefined;
  let mutationAttempted = false;
  let observation: ReleaseNotesMutationObservation | undefined;
  await withReleaseNotesEnv(
    async (env) => {
      await withTempDir(
        RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
        async (outsideDirectory) => {
          const fixture = await createSymlinkedReleaseNotesFixture(
            env,
            outsideDirectory,
          );
          targetPathToSwap = fixture.canonicalArtifactPath;
          actualDirectoryToSwap = fixture.actualDirectory;
          outsideDirectoryToSwap = outsideDirectory;
          const outsideCanonicalPath = await env.canonicalizePath(
            fixture.outsideArtifactPath,
          );
          if (outsideCanonicalPath === undefined) {
            throw new Error("Outside artifact path cannot be canonicalized");
          }
          const outsideOriginalContent = await env.readArtifact(
            fixture.outsideArtifactPath,
            outsideCanonicalPath,
          );
          let error: unknown;
          try {
            await composeReleaseNotesInEnv(env, {
              releaseData: fixture.releaseData,
              config: fixture.config,
              agentRunner: fixture.agentRunner,
              readArtifact: mutationCase === RELEASE_NOTES_MUTATION_CASE.FINAL_SYMLINK
                  || mutationCase === RELEASE_NOTES_MUTATION_CASE.ANCESTOR_READ
                ? async (path, expectedCanonicalPath) => {
                  if (path === fixture.canonicalArtifactPath) {
                    mutationAttempted = true;
                    if (
                      mutationCase
                        === RELEASE_NOTES_MUTATION_CASE.FINAL_SYMLINK
                    ) {
                      await rm(path);
                      await symlink(
                        fixture.outsideArtifactPath,
                        path,
                        RELEASE_NOTES_FILE_SYMLINK_TYPE,
                      );
                    } else {
                      await rm(fixture.actualDirectory, {
                        recursive: true,
                      });
                      await symlink(
                        outsideDirectory,
                        fixture.actualDirectory,
                        RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
                      );
                    }
                  }
                  return await env.readArtifact(
                    path,
                    expectedCanonicalPath,
                  );
                }
                : env.readArtifact,
            });
          } catch (caught) {
            error = caught;
          }
          observation = {
            error,
            mutationAttempted,
            actualCanonicalPath: await env.canonicalizePath(
              fixture.canonicalArtifactPath,
            ),
            expectedCanonicalPath: outsideCanonicalPath,
            outsideContent: await env.readArtifact(
              fixture.outsideArtifactPath,
              outsideCanonicalPath,
            ),
            expectedOutsideContent: outsideOriginalContent,
            outsideArtifactPath: fixture.outsideArtifactPath,
            outsideChildDirectoryPath: undefined,
            outsideArtifactCanonicalPath: undefined,
            outsideChildDirectoryCanonicalPath: undefined,
          };
        },
      );
    },
    {
      beforeArtifactPromotionOpen: async (path) => {
        if (
          mutationCase === RELEASE_NOTES_MUTATION_CASE.PROMOTION_OPEN
          && path === targetPathToSwap
        ) {
          mutationAttempted = true;
          await swapReleaseNotesAncestor(
            actualDirectoryToSwap,
            outsideDirectoryToSwap,
          );
        }
      },
      beforeFinalArtifactWrite: async (path) => {
        if (
          mutationCase === RELEASE_NOTES_MUTATION_CASE.FINAL_WRITE
          && path === targetPathToSwap
        ) {
          mutationAttempted = true;
          await swapReleaseNotesAncestor(
            actualDirectoryToSwap,
            outsideDirectoryToSwap,
          );
        }
      },
    },
  );
  if (observation === undefined) {
    throw new Error("Release-notes mutation produced no observation");
  }
  return observation;
}

export async function observeReleaseNotesSymlinkToRootPath(): Promise<ReleaseNotesSymlinkRootObservation> {
  const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
  let observation: ReleaseNotesSymlinkRootObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const [symlinkSegment] = sampleReleaseTestValue(
      RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
    );
    const symlinkPath = join(env.workingDirectory, symlinkSegment);
    const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
    const expectedResult = {
      changelogPath: join(env.workingDirectory, DEFAULT_CHANGELOG_PATH),
    };
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      expectedResult.changelogPath,
      conformant,
    );
    await symlink(
      env.workingDirectory,
      symlinkPath,
      RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
    );
    observation = {
      result: await composeReleaseNotesInEnv(env, {
        releaseData,
        config: { changelogPath },
        agentRunner,
      }),
      expectedResult,
      agentRequestCount: agentRunner.requests.length,
    };
  });
  if (observation === undefined) {
    throw new Error("Release-notes symlink-root path produced no observation");
  }
  return observation;
}

interface SymlinkedReleaseNotesFixture {
  readonly releaseData: ReleaseData;
  readonly config: { readonly changelogPath: string };
  readonly agentRunner: ReturnType<typeof recordingReleaseNotesAgent>;
  readonly actualDirectory: string;
  readonly canonicalArtifactPath: string;
  readonly outsideArtifactPath: string;
}

async function createSymlinkedReleaseNotesFixture(
  env: ReleaseNotesEnv,
  outsideDirectory: string,
): Promise<SymlinkedReleaseNotesFixture> {
  const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
  const [actualSegment, symlinkSegment] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
  );
  const actualDirectory = join(env.workingDirectory, actualSegment);
  const symlinkPath = join(env.workingDirectory, symlinkSegment);
  const config = {
    changelogPath: join(symlinkSegment, DEFAULT_CHANGELOG_PATH),
  };
  const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, config);
  const canonicalArtifactPath = join(actualDirectory, DEFAULT_CHANGELOG_PATH);
  const outsideArtifactPath = join(outsideDirectory, DEFAULT_CHANGELOG_PATH);
  await mkdir(actualDirectory);
  await symlink(
    actualDirectory,
    symlinkPath,
    RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  );
  await writeFile(
    outsideArtifactPath,
    sampleReleaseTestValue(
      arbitraryConformantChangelog(releaseData.version, subjects),
    ),
  );
  return {
    releaseData,
    config,
    agentRunner: recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      conformant,
    ),
    actualDirectory,
    canonicalArtifactPath,
    outsideArtifactPath,
  };
}

async function swapReleaseNotesAncestor(
  actualDirectory: string | undefined,
  outsideDirectory: string | undefined,
): Promise<void> {
  if (actualDirectory === undefined || outsideDirectory === undefined) {
    throw new Error("Release-notes ancestor swap fixture is incomplete");
  }
  await rm(actualDirectory, { recursive: true });
  await symlink(
    outsideDirectory,
    actualDirectory,
    RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
  );
}

async function observeReleaseNotesDirectoryCreateMutation(): Promise<ReleaseNotesMutationObservation> {
  const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
  const [actualSegment, symlinkSegment, childSegment] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
  );
  let targetDirectoryToSwap: string | undefined;
  let actualDirectoryToSwap: string | undefined;
  let outsideDirectoryToSwap: string | undefined;
  let mutationAttempted = false;
  let observation: ReleaseNotesMutationObservation | undefined;
  await withTempDir(
    RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
    async (outsideDirectory) => {
      await withReleaseNotesEnv(
        async (env) => {
          const actualDirectory = join(env.workingDirectory, actualSegment);
          const symlinkPath = join(env.workingDirectory, symlinkSegment);
          const changelogPath = join(
            symlinkSegment,
            childSegment,
            DEFAULT_CHANGELOG_PATH,
          );
          const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {
            changelogPath,
          });
          await mkdir(actualDirectory);
          await symlink(
            actualDirectory,
            symlinkPath,
            RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE,
          );
          targetDirectoryToSwap = join(actualDirectory, childSegment);
          actualDirectoryToSwap = actualDirectory;
          outsideDirectoryToSwap = outsideDirectory;
          const outsideArtifactPath = join(
            outsideDirectory,
            childSegment,
            DEFAULT_CHANGELOG_PATH,
          );
          const outsideChildDirectoryPath = join(
            outsideDirectory,
            childSegment,
          );
          let error: unknown;
          try {
            await composeReleaseNotesInEnv(env, {
              releaseData,
              config: { changelogPath },
              agentRunner: recordingReleaseNotesAgent(
                env.workingDirectory,
                resolvedPath,
                conformant,
              ),
            });
          } catch (caught) {
            error = caught;
          }
          observation = {
            error,
            mutationAttempted,
            actualCanonicalPath: undefined,
            expectedCanonicalPath: undefined,
            outsideContent: undefined,
            expectedOutsideContent: undefined,
            outsideArtifactPath,
            outsideChildDirectoryPath,
            outsideArtifactCanonicalPath: await env.canonicalizePath(outsideArtifactPath),
            outsideChildDirectoryCanonicalPath: await env.canonicalizePath(
              outsideChildDirectoryPath,
            ),
          };
        },
        {
          beforeDirectoryCreate: async (path) => {
            if (path === targetDirectoryToSwap) {
              mutationAttempted = true;
              await swapReleaseNotesAncestor(
                actualDirectoryToSwap,
                outsideDirectoryToSwap,
              );
            }
          },
        },
      );
    },
  );
  if (observation === undefined) {
    throw new Error("Release-notes directory mutation produced no observation");
  }
  return observation;
}

async function observeReleaseNotesRewriteMutation(): Promise<ReleaseNotesMutationObservation> {
  const { releaseData, conformant } = sampleReleaseNotesCompositionFixture();
  let mutationAttempted = false;
  let observation: ReleaseNotesMutationObservation | undefined;
  await withReleaseNotesEnv(
    async (env) => {
      const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
      let error: unknown;
      try {
        await composeReleaseNotesInEnv(env, {
          releaseData,
          config: {},
          agentRunner: recordingReleaseNotesAgent(
            env.workingDirectory,
            resolvedPath,
            conformant,
          ),
        });
      } catch (caught) {
        error = caught;
      }
      observation = {
        error,
        mutationAttempted,
        actualCanonicalPath: undefined,
        expectedCanonicalPath: undefined,
        outsideContent: undefined,
        expectedOutsideContent: undefined,
        outsideArtifactPath: undefined,
        outsideChildDirectoryPath: undefined,
        outsideArtifactCanonicalPath: undefined,
        outsideChildDirectoryCanonicalPath: undefined,
      };
    },
    {
      beforeArtifactRead: async (path) => {
        mutationAttempted = true;
        await writeFile(path, `${conformant}${conformant}`);
      },
    },
  );
  if (observation === undefined) {
    throw new Error("Release-notes rewrite mutation produced no observation");
  }
  return observation;
}

async function observeStagedArtifactSymlinkMutation(): Promise<ReleaseNotesMutationObservation> {
  let stagedPathToSwap: string | undefined;
  let replacementArtifactPath: string | undefined;
  let mutationAttempted = false;
  let observation: ReleaseNotesMutationObservation | undefined;
  await withReleaseNotesEnv(
    async (env) => {
      const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
      const replacementConformant = sampleReleaseTestValue(
        arbitraryConformantChangelog(releaseData.version, subjects),
      );
      const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
      const agentRunner = {
        async run(
          request: Parameters<RecordingWritingAgentRunner["run"]>[0],
        ): Promise<void> {
          const stagedPath = promptChangelogPath(request.prompt);
          if (stagedPath === undefined) {
            throw new Error(
              "Release-notes prompt omitted the staged changelog path",
            );
          }
          stagedPathToSwap = stagedPath;
          const [replacementSegment] = sampleReleaseTestValue(
            RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
          );
          replacementArtifactPath = join(
            dirname(stagedPath),
            replacementSegment,
          );
          await writeFile(replacementArtifactPath, replacementConformant);
          await recordingReleaseNotesAgent(
            request.workingDirectory,
            stagedPath,
            conformant,
          ).run(request);
        },
      };
      let error: unknown;
      try {
        await composeReleaseNotesInEnv(env, {
          releaseData,
          config: {},
          agentRunner,
        });
      } catch (caught) {
        error = caught;
      }
      observation = {
        error,
        mutationAttempted,
        actualCanonicalPath: await env.canonicalizePath(resolvedPath),
        expectedCanonicalPath: undefined,
        outsideContent: undefined,
        expectedOutsideContent: undefined,
        outsideArtifactPath: undefined,
        outsideChildDirectoryPath: undefined,
        outsideArtifactCanonicalPath: undefined,
        outsideChildDirectoryCanonicalPath: undefined,
      };
    },
    {
      beforeStageArtifactRead: async (path) => {
        if (path === stagedPathToSwap) {
          mutationAttempted = true;
          if (replacementArtifactPath === undefined) {
            throw new Error(
              "Release-notes staged symlink replacement path is incomplete",
            );
          }
          await rm(path);
          await symlink(
            replacementArtifactPath,
            path,
            RELEASE_NOTES_FILE_SYMLINK_TYPE,
          );
        }
      },
    },
  );
  if (observation === undefined) {
    throw new Error(
      "Staged release-notes symlink mutation produced no observation",
    );
  }
  return observation;
}

function windowsContainmentObservation(
  roots: ReturnType<typeof RELEASE_TEST_GENERATOR.distinctWindowsDriveRoots>,
): ReleaseNotesPathContainmentObservation {
  const [rootBase, candidateBase] = sampleReleaseTestValue(roots);
  const [rootSegment] = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctPathSegmentTriple(),
  );
  return {
    actual: isPathContained(
      win32.join(rootBase, rootSegment),
      win32.join(candidateBase, DEFAULT_CHANGELOG_PATH),
    ),
    expected: false,
  };
}

async function canonicalExistingDirectoryPath(
  artifactPath: string,
  env: ReleaseNotesEnv,
): Promise<string> {
  const canonicalDirectory = await env.canonicalizePath(dirname(artifactPath));
  if (canonicalDirectory === undefined) {
    throw new ReleaseNotesError(
      "Release-notes output directory cannot be canonicalized",
    );
  }
  return join(canonicalDirectory, basename(artifactPath));
}

async function observeExistingReleaseNotesSectionInEnv(
  env: ReleaseNotesEnv,
  existingSectionCase: ReleaseNotesExistingSectionCase,
): Promise<ReleaseNotesExistingSectionObservation> {
  const { workingDirectory, readArtifact, canonicalizePath } = env;
  const { releaseData, subjects, conformant } = sampleReleaseNotesCompositionFixture();
  const priorVersion = sampleReleaseTestValue(
    RELEASE_TEST_GENERATOR.distinctSemverFrom(releaseData.version),
  );
  const resolvedPath = resolveReleaseNotesPath(workingDirectory, {});
  const existingNotes = existingReleaseNotes(
    existingSectionCase,
    priorVersion,
    subjects,
  );
  const generatedNotes = generatedReleaseNotes(
    existingSectionCase,
    releaseData.version,
    priorVersion,
    subjects,
    conformant,
    existingNotes,
  );
  if (existingNotes.length > 0) await writeFile(resolvedPath, existingNotes);
  const writingAgent = new RecordingWritingAgentRunner(
    workingDirectory,
    resolvedPath,
    generatedNotes,
  );
  let stagedInput: string | undefined;
  let stagedCanonicalPath: string | undefined;
  const agentRunner = existingSectionCase === RELEASE_NOTES_EXISTING_SECTION_CASE.DELETED_SECTION
    ? {
      async run(
        request: Parameters<RecordingWritingAgentRunner["run"]>[0],
      ): Promise<void> {
        const stagedPath = promptChangelogPath(request.prompt);
        if (stagedPath === undefined) {
          throw new Error(
            "Release-notes prompt omitted the staged changelog path",
          );
        }
        stagedCanonicalPath = await canonicalizePath(stagedPath);
        if (stagedCanonicalPath !== undefined) {
          stagedInput = await readArtifact(stagedPath, stagedCanonicalPath);
        }
        await writingAgent.run(request);
      },
    }
    : writingAgent;
  let result: { readonly changelogPath: string } | undefined;
  let error: unknown;
  try {
    result = await composeReleaseNotes({
      releaseData,
      config: {},
      workingDirectory,
      agentRunner,
      readArtifact: env.readArtifact,
      createArtifactStage: env.createArtifactStage,
      promoteArtifact: env.promoteArtifact,
      faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
      canonicalizePath: env.canonicalizePath,
      isSymbolicLink: env.isSymbolicLink,
      isFile: env.isFile,
    });
  } catch (caught) {
    error = caught;
  }
  const accepted = existingSectionCase
      === RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION
    || existingSectionCase
      === RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES
    || existingSectionCase
      === RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE;
  const stagedPromptPath = promptChangelogPath(writingAgent.lastPrompt);
  if (stagedPromptPath === undefined) {
    throw new Error("Release-notes prompt omitted the staged changelog path");
  }
  return {
    error,
    result,
    expectedResult: accepted ? { changelogPath: resolvedPath } : undefined,
    finalContent: await readArtifact(resolvedPath),
    expectedFinalContent: accepted ? generatedNotes : existingNotes,
    prompt: writingAgent.lastPrompt,
    stagedPromptPath,
    expectedCanonicalPath: await canonicalizePath(resolvedPath),
    promptWorkingDirectory: writingAgent.requests.at(0)?.workingDirectory ?? workingDirectory,
    stagedInput,
    stagedCanonicalPath,
    preservationInstruction: CHANGELOG_PRESERVATION_INSTRUCTION,
  };
}

function existingReleaseNotes(
  existingSectionCase: ReleaseNotesExistingSectionCase,
  priorVersion: string,
  subjects: readonly string[],
): string {
  switch (existingSectionCase) {
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION:
      return "";
    case RELEASE_NOTES_EXISTING_SECTION_CASE.FENCED_SECTION:
    case RELEASE_NOTES_EXISTING_SECTION_CASE.DELETED_SECTION:
      return sampleReleaseTestValue(
        arbitraryConformantChangelog(priorVersion, subjects),
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES:
      return changelogWithFooterReferences(priorVersion, subjects);
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_FENCED_REFERENCES:
      return changelogWithFencedReferenceDefinition(priorVersion, subjects);
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_IN_SECTION_REFERENCE:
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE:
      return changelogWithInSectionReferenceDefinition(priorVersion, subjects);
  }
}

function generatedReleaseNotes(
  existingSectionCase: ReleaseNotesExistingSectionCase,
  version: string,
  priorVersion: string,
  subjects: readonly string[],
  conformant: string,
  existingNotes: string,
): string {
  switch (existingSectionCase) {
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PROMPT_PRESERVATION:
    case RELEASE_NOTES_EXISTING_SECTION_CASE.DELETED_SECTION:
      return conformant;
    case RELEASE_NOTES_EXISTING_SECTION_CASE.FENCED_SECTION:
      return [
        conformant,
        MARKDOWN_FENCE_BACKTICK_MARKER,
        existingNotes,
        MARKDOWN_FENCE_BACKTICK_MARKER,
      ].join("\n");
    case RELEASE_NOTES_EXISTING_SECTION_CASE.UPDATED_FOOTER_REFERENCES:
      return changelogWithPrependedReleaseAndFooterReferences(
        version,
        priorVersion,
        subjects,
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_FENCED_REFERENCES:
      return changelogWithTruncatedFencedReferenceDefinitionSection(
        version,
        priorVersion,
        subjects,
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.TRUNCATED_IN_SECTION_REFERENCE:
      return changelogWithPrependedReleaseAndTruncatedInSectionReference(
        version,
        priorVersion,
        subjects,
      );
    case RELEASE_NOTES_EXISTING_SECTION_CASE.PRESERVED_IN_SECTION_REFERENCE:
      return changelogWithPrependedReleaseAndInSectionReference(
        version,
        priorVersion,
        subjects,
      );
  }
}

export { DEFAULT_CHANGELOG_PATH };
