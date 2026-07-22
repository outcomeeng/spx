import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

import type { AgentAuditor, AgentAuditRequest, AgentRunRequest } from "@/agent/agent-runner";
import type { ReleaseData } from "@/domains/release/release-data";
import {
  CHANGELOG_PATH_DATA_BLOCK_CLOSE,
  CHANGELOG_PATH_DATA_BLOCK_OPEN,
  COMMIT_SUBJECTS_DATA_BLOCK_CLOSE,
  COMMIT_SUBJECTS_DATA_BLOCK_OPEN,
  composeReleaseNotes,
  createReleaseNotesFaithfulnessAuditor,
  DEFAULT_CHANGELOG_PATH,
  RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_CLOSE,
  RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_OPEN,
  RELEASE_NOTES_FAITHFULNESS_APPROVED,
  RELEASE_VERSION_DATA_BLOCK_CLOSE,
  RELEASE_VERSION_DATA_BLOCK_OPEN,
  ReleaseNotesError,
  resolveReleaseNotesPath,
} from "@/domains/release/release-notes";
import { isPathContained, PATH_CONTAINMENT_PARENT_DIRECTORY } from "@/lib/file-system/pathContainment";
import {
  type AbsoluteReleaseNotesPathInput,
  type PartialWriteReleaseNotesInput,
  RELEASE_NOTES_EXISTING_SECTION_CASE,
  RELEASE_NOTES_FAITHFULNESS_CASE,
  RELEASE_NOTES_MUTATION_CASE,
  RELEASE_NOTES_PATH_CASE,
  RELEASE_NOTES_PROMPT_CASE,
  type ReleaseNotesConfiguredPathRejectionInput,
  type ReleaseNotesExistingSectionInput,
  type ReleaseNotesFaithfulnessInput,
  type ReleaseNotesMutationInput,
  type ReleaseNotesPathInput,
  type ReleaseNotesPromptInput,
  type SymlinkRootReleaseNotesInput,
} from "@testing/generators/release/release-notes";
import { promptChangelogPath, RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import {
  approvingReleaseNotesFaithfulnessAuditor,
  canonicalRelativeChangelogPath,
  composeReleaseNotesInEnv,
  recordingReleaseNotesAgent,
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

export interface ReleaseNotesExistingSectionObservation {
  readonly error: unknown;
  readonly result: { readonly changelogPath: string } | undefined;
  readonly resolvedPath: string;
  readonly finalContent: string;
  readonly prompt: string;
  readonly stagedPromptPath: string;
  readonly canonicalOutputPath: string | undefined;
  readonly promptWorkingDirectory: string;
  readonly stagedInput: string | undefined;
  readonly stagedCanonicalPath: string | undefined;
}

export interface ReleaseNotesConfiguredPathRejectionObservation {
  readonly error: unknown;
  readonly agentRequestCount: number;
}

export interface ReleaseNotesAbsolutePathObservation {
  readonly stagedPromptPath: string;
  readonly canonicalOutputPath: string;
  readonly promptWorkingDirectory: string;
  readonly readBackPath: string | undefined;
  readonly finalContent: string;
}

export interface ReleaseNotesPartialWriteFailureObservation {
  readonly error: unknown;
  readonly finalContent: string;
  readonly directoryEntries: readonly string[];
}

export interface ReleaseNotesFaithfulnessObservation {
  readonly error: unknown;
  readonly result: { readonly changelogPath: string } | undefined;
  readonly auditAttempted: boolean;
  readonly promotionAttempted: boolean;
  readonly actualReleaseData: ReleaseData | undefined;
  readonly auditedSection: string | undefined;
  readonly finalContent: string | undefined;
  readonly canonicalOutputPath: string | undefined;
  readonly auditRequest: AgentAuditRequest | undefined;
  readonly auditPrompt: string;
  readonly auditSectionDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly workingDirectory: string;
}

export interface ReleaseNotesMutationObservation {
  readonly error: unknown;
  readonly mutationAttempted: boolean;
  readonly actualCanonicalPath: string | undefined;
  readonly outsideCanonicalPath: string | undefined;
  readonly outsideContent: string | undefined;
  readonly originalOutsideContent: string | undefined;
  readonly outsideArtifactPath: string | undefined;
  readonly outsideChildDirectoryPath: string | undefined;
  readonly outsideArtifactCanonicalPath: string | undefined;
  readonly outsideChildDirectoryCanonicalPath: string | undefined;
}

interface ReleaseNotesMutationObservationFields extends Partial<ReleaseNotesMutationObservation> {
  readonly error: unknown;
  readonly mutationAttempted: boolean;
}

function releaseNotesMutationObservation(
  fields: ReleaseNotesMutationObservationFields,
): ReleaseNotesMutationObservation {
  return {
    actualCanonicalPath: undefined,
    outsideCanonicalPath: undefined,
    outsideContent: undefined,
    originalOutsideContent: undefined,
    outsideArtifactPath: undefined,
    outsideChildDirectoryPath: undefined,
    outsideArtifactCanonicalPath: undefined,
    outsideChildDirectoryCanonicalPath: undefined,
    ...fields,
  };
}

export interface ReleaseNotesSymlinkRootObservation {
  readonly result: { readonly changelogPath: string };
  readonly resolvedPath: string;
  readonly agentRequestCount: number;
}

export interface ReleaseNotesPromptObservation {
  readonly prompt: string;
  readonly versionDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly subjectsDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly pathDataBlock: ReleaseNotesPromptDataBlockObservation;
  readonly stagedPromptPath: string;
  readonly canonicalOutputPath: string | undefined;
  readonly checkedStagedPromptPath: string | undefined;
  readonly request: AgentRunRequest;
  readonly requestWorkingDirectoryCanonicalDuring: string | undefined;
  readonly requestWorkingDirectoryCanonicalAfter: string | undefined;
  readonly resolvedPath: string;
  readonly lexicalResolvedPath: string | undefined;
  readonly canonicalArtifactPath: string | undefined;
  readonly finalContent: string | undefined;
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
  readonly readBackPath: string | undefined;
  readonly canonicalReadBackPath: string | undefined;
  readonly actualArtifactCanonicalPath: string | undefined;
  readonly replacementArtifactContent: string | undefined;
  readonly symlinkCanonicalPath: string | undefined;
  readonly outsideCanonicalPath: string | undefined;
}

export async function observeReleaseNotesPrompt(
  input: ReleaseNotesPromptInput,
): Promise<ReleaseNotesPromptObservation> {
  if (input.kind === RELEASE_NOTES_PROMPT_CASE.CANONICAL_PARENT_TRAVERSAL) {
    return await observeCanonicalParentTraversalPrompt(input);
  }
  let observation: ReleaseNotesPromptObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const { fixture, changelogPath } = input;
    const config = changelogPath === undefined ? {} : { changelogPath };
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, config);
    const canonicalOutputPath = await canonicalRelativeChangelogPath(
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
    const agentRunner = input.kind === RELEASE_NOTES_PROMPT_CASE.STANDARD_DATA
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
      stagedPromptPath,
      canonicalOutputPath,
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
    };
  });
  if (observation === undefined) {
    throw new Error("Release-notes prompt produced no observation");
  }
  return observation;
}

async function observeCanonicalParentTraversalPrompt(
  input: ReleaseNotesPromptInput,
): Promise<ReleaseNotesPromptObservation> {
  let observation: ReleaseNotesPromptObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const { releaseData, conformant } = input.fixture;
    const [actualSegment, childSegment, symlinkSegment] = input.pathSegments;
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
      stagedPromptPath: requiredPromptChangelogPath(agentRunner.lastPrompt),
      canonicalOutputPath: await env.canonicalizePath(canonicalArtifactPath),
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
  input: ReleaseNotesExistingSectionInput,
): Promise<ReleaseNotesExistingSectionObservation> {
  let observation: ReleaseNotesExistingSectionObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    observation = await observeExistingReleaseNotesSectionInEnv(
      env,
      input,
    );
  });
  if (observation === undefined) {
    throw new Error("Existing release-notes section produced no observation");
  }
  return observation;
}

export async function observeConfiguredReleaseNotesPathRejection(
  input: ReleaseNotesConfiguredPathRejectionInput,
): Promise<ReleaseNotesConfiguredPathRejectionObservation> {
  const { fixture, changelogPath } = input;
  const { releaseData, conformant } = fixture;
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
  input: ReleaseNotesPathInput,
): Promise<ReleaseNotesPathObservation> {
  const needsOutsideDirectory = input.kind === RELEASE_NOTES_PATH_CASE.PRE_AGENT_ANCESTOR_SWAP
    || input.kind === RELEASE_NOTES_PATH_CASE.ESCAPING_SYMLINK
    || input.kind === RELEASE_NOTES_PATH_CASE.DANGLING_FINAL_SYMLINK
    || input.kind === RELEASE_NOTES_PATH_CASE.ABOVE_SYMLINK_TARGET;
  let observation: ReleaseNotesPathObservation | undefined;
  if (needsOutsideDirectory) {
    await withTempDir(
      RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX,
      async (outsideDirectory) => {
        await withReleaseNotesEnv(async (env) => {
          observation = await observeReleaseNotesPathInEnv(
            env,
            input,
            outsideDirectory,
          );
        });
      },
    );
  } else {
    await withReleaseNotesEnv(async (env) => {
      observation = await observeReleaseNotesPathInEnv(env, input);
    });
  }
  if (observation === undefined) {
    throw new Error("Release-notes path produced no observation");
  }
  return observation;
}

async function observeReleaseNotesPathInEnv(
  env: ReleaseNotesEnv,
  input: ReleaseNotesPathInput,
  outsideDirectory?: string,
): Promise<ReleaseNotesPathObservation> {
  const { releaseData, conformant } = input.fixture;
  const { kind: pathCase, pathSegments } = input;
  if (pathCase === RELEASE_NOTES_PATH_CASE.CONFIGURED_INSIDE) {
    const changelogPath = requiredConfiguredPath(input);
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
      agentRunner.requests.length,
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.NESTED_MISSING_PARENT) {
    const changelogPath = requiredConfiguredPath(input);
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
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.BELOW_FILE) {
    const [parentFileSegment] = pathSegments;
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
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.BELOW_FILE_SYMLINK) {
    const [actualFileSegment, symlinkSegment] = pathSegments;
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
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.SYMLINK_READBACK) {
    const [actualSegment, symlinkSegment] = pathSegments;
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
      agentRunner.requests.length,
      {
        readBackPath,
        canonicalReadBackPath: await env.canonicalizePath(
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
      input,
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.PRE_AGENT_ANCESTOR_SWAP) {
    return await observeReleaseNotesPreAgentSwapPath(
      env,
      requiredOutsideDirectory(outsideDirectory),
      input,
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.ESCAPING) {
    const changelogPath = requiredConfiguredPath(input);
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
      agentRunner.requests.length,
      { error },
    );
  }
  if (pathCase === RELEASE_NOTES_PATH_CASE.ESCAPING_SYMLINK) {
    const [, symlinkSegment] = pathSegments;
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
      agentRunner.requests.length,
      { error },
    );
  }
  const [, symlinkSegment] = pathSegments;
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
    agentRunner.requests.length,
    { error },
  );
}

async function observeReleaseNotesRetargetPath(
  env: ReleaseNotesEnv,
  input: ReleaseNotesPathInput,
): Promise<ReleaseNotesPathObservation> {
  const { releaseData, conformant } = input.fixture;
  const [actualSegment, symlinkSegment, replacementSegment] = input.pathSegments;
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
  const replacementContent = input.replacementContent;
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
  await writeFile(replacementArtifactPath, replacementContent);
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
    writingAgentRunner.requests.length,
    {
      error,
      actualArtifactCanonicalPath: await env.canonicalizePath(actualArtifactPath),
      replacementArtifactContent: await env.readArtifact(
        replacementArtifactPath,
        await env.canonicalizePath(replacementArtifactPath),
      ),
    },
  );
}

async function observeReleaseNotesPreAgentSwapPath(
  env: ReleaseNotesEnv,
  outsideDirectory: string,
  input: ReleaseNotesPathInput,
): Promise<ReleaseNotesPathObservation> {
  const { releaseData, conformant } = input.fixture;
  const [actualSegment, symlinkSegment] = input.pathSegments;
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
    agentRunner.requests.length,
    {
      error,
      actualArtifactCanonicalPath: await env.canonicalizePath(resolvedPath),
      symlinkCanonicalPath: await env.canonicalizePath(symlinkPath),
      outsideCanonicalPath: await env.canonicalizePath(outsideDirectory),
    },
  );
}

function releaseNotesPathObservation(
  env: ReleaseNotesEnv,
  resolvedPath: string,
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
    readBackPath: undefined,
    canonicalReadBackPath: undefined,
    actualArtifactCanonicalPath: undefined,
    replacementArtifactContent: undefined,
    symlinkCanonicalPath: undefined,
    outsideCanonicalPath: undefined,
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

function requiredConfiguredPath(input: ReleaseNotesPathInput): string {
  if (input.changelogPath === undefined) {
    throw new Error("Release-notes path case omitted its configured path");
  }
  return input.changelogPath;
}

export async function observeAbsoluteInTreeReleaseNotesPath(
  input: AbsoluteReleaseNotesPathInput,
): Promise<ReleaseNotesAbsolutePathObservation> {
  const { fixture, relativeChangelogPath } = input;
  let observation: ReleaseNotesAbsolutePathObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const { releaseData, conformant } = fixture;
    const changelogPath = resolve(env.workingDirectory, relativeChangelogPath);
    await mkdir(dirname(changelogPath), { recursive: true });
    const canonicalOutputPath = await canonicalExistingDirectoryPath(
      changelogPath,
      env,
    );
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      canonicalOutputPath,
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
      canonicalOutputPath,
      promptWorkingDirectory: agentRunner.requests.at(0)?.workingDirectory ?? env.workingDirectory,
      readBackPath,
      finalContent: await env.readArtifact(canonicalOutputPath),
    };
  });
  if (observation === undefined) {
    throw new Error("Absolute release-notes path produced no observation");
  }
  return observation;
}

export async function observeReleaseNotesPartialWriteFailure(
  input: PartialWriteReleaseNotesInput,
): Promise<ReleaseNotesPartialWriteFailureObservation> {
  const { existingContent, replacementContent } = input;
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
        directoryEntries: await readdir(env.workingDirectory),
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
  input: ReleaseNotesFaithfulnessInput,
): Promise<ReleaseNotesFaithfulnessObservation> {
  const {
    fixture: { releaseData, conformant },
    existingNotes,
    generatedNotes,
    productionAuditSection,
  } = input;
  if (input.kind === RELEASE_NOTES_FAITHFULNESS_CASE.PRODUCTION_AUDITOR) {
    return await observeProductionFaithfulnessAudit(
      releaseData,
      requiredProductionAuditSection(productionAuditSection),
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
    if (input.kind === RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION) {
      await writeFile(resolvedPath, existingNotes);
    }
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
      input.kind === RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION
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
          if (input.kind === RELEASE_NOTES_FAITHFULNESS_CASE.REJECTION) {
            throw new ReleaseNotesError(
              "Generated release notes failed faithfulness audit",
            );
          }
        },
        promoteArtifact: input.kind === RELEASE_NOTES_FAITHFULNESS_CASE.REJECTION
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
      auditedSection,
      finalContent: input.kind === RELEASE_NOTES_FAITHFULNESS_CASE.CURRENT_SECTION
        ? await env.readArtifact(resolvedPath)
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
    };
  });
  if (observation === undefined) {
    throw new Error("Release-notes faithfulness produced no observation");
  }
  return observation;
}

function requiredProductionAuditSection(
  section: string | undefined,
): string {
  if (section === undefined) {
    throw new Error("Production faithfulness case omitted its audit section");
  }
  return section;
}

async function observeProductionFaithfulnessAudit(
  releaseData: ReleaseData,
  currentSection: string,
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
      auditedSection: currentSection,
      finalContent: undefined,
      canonicalOutputPath: undefined,
      auditRequest,
      auditPrompt: auditRequest?.prompt ?? "",
      auditSectionDataBlock: observePromptDataBlock(
        auditRequest?.prompt ?? "",
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_OPEN,
        RELEASE_NOTES_AUDIT_SECTION_DATA_BLOCK_CLOSE,
      ),
      workingDirectory: env.workingDirectory,
    };
  });
  if (observation === undefined) {
    throw new Error("Production faithfulness audit produced no observation");
  }
  return observation;
}

export async function observeReleaseNotesMutation(
  input: ReleaseNotesMutationInput,
): Promise<ReleaseNotesMutationObservation> {
  if (input.kind === RELEASE_NOTES_MUTATION_CASE.DIRECTORY_CREATE) {
    return await observeReleaseNotesDirectoryCreateMutation(input);
  }
  if (input.kind === RELEASE_NOTES_MUTATION_CASE.IN_PLACE_REWRITE) {
    return await observeReleaseNotesRewriteMutation(input);
  }
  if (input.kind === RELEASE_NOTES_MUTATION_CASE.STAGED_ARTIFACT_SYMLINK) {
    return await observeStagedArtifactSymlinkMutation(input);
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
            input,
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
              readArtifact: input.kind === RELEASE_NOTES_MUTATION_CASE.FINAL_SYMLINK
                  || input.kind === RELEASE_NOTES_MUTATION_CASE.ANCESTOR_READ
                ? async (path, checkedCanonicalPath) => {
                  if (path === fixture.canonicalArtifactPath) {
                    mutationAttempted = true;
                    if (
                      input.kind
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
                    checkedCanonicalPath,
                  );
                }
                : env.readArtifact,
            });
          } catch (caught) {
            error = caught;
          }
          observation = releaseNotesMutationObservation({
            error,
            mutationAttempted,
            actualCanonicalPath: await env.canonicalizePath(
              fixture.canonicalArtifactPath,
            ),
            outsideCanonicalPath,
            outsideContent: await env.readArtifact(
              fixture.outsideArtifactPath,
              outsideCanonicalPath,
            ),
            originalOutsideContent: outsideOriginalContent,
            outsideArtifactPath: fixture.outsideArtifactPath,
          });
        },
      );
    },
    {
      beforeArtifactPromotionOpen: async (path) => {
        if (
          input.kind === RELEASE_NOTES_MUTATION_CASE.PROMOTION_OPEN
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
          input.kind === RELEASE_NOTES_MUTATION_CASE.FINAL_WRITE
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

export async function observeReleaseNotesSymlinkToRootPath(
  input: SymlinkRootReleaseNotesInput,
): Promise<ReleaseNotesSymlinkRootObservation> {
  const { fixture, symlinkSegment } = input;
  const { releaseData, conformant } = fixture;
  let observation: ReleaseNotesSymlinkRootObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const symlinkPath = join(env.workingDirectory, symlinkSegment);
    const changelogPath = join(symlinkSegment, DEFAULT_CHANGELOG_PATH);
    const resolvedPath = join(env.workingDirectory, DEFAULT_CHANGELOG_PATH);
    const agentRunner = recordingReleaseNotesAgent(
      env.workingDirectory,
      resolvedPath,
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
      resolvedPath,
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
  input: ReleaseNotesMutationInput,
): Promise<SymlinkedReleaseNotesFixture> {
  const { releaseData, conformant } = input.fixture;
  const [actualSegment, symlinkSegment] = input.pathSegments;
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
  await writeFile(outsideArtifactPath, input.replacementContent);
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

async function observeReleaseNotesDirectoryCreateMutation(
  input: ReleaseNotesMutationInput,
): Promise<ReleaseNotesMutationObservation> {
  const { releaseData, conformant } = input.fixture;
  const [actualSegment, symlinkSegment, childSegment] = input.pathSegments;
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
          observation = releaseNotesMutationObservation({
            error,
            mutationAttempted,
            outsideArtifactPath,
            outsideChildDirectoryPath,
            outsideArtifactCanonicalPath: await env.canonicalizePath(outsideArtifactPath),
            outsideChildDirectoryCanonicalPath: await env.canonicalizePath(
              outsideChildDirectoryPath,
            ),
          });
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

async function observeReleaseNotesRewriteMutation(
  input: ReleaseNotesMutationInput,
): Promise<ReleaseNotesMutationObservation> {
  const { releaseData, conformant } = input.fixture;
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
      observation = releaseNotesMutationObservation({
        error,
        mutationAttempted,
      });
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

async function observeStagedArtifactSymlinkMutation(
  input: ReleaseNotesMutationInput,
): Promise<ReleaseNotesMutationObservation> {
  let stagedPathToSwap: string | undefined;
  let replacementArtifactPath: string | undefined;
  let mutationAttempted = false;
  let observation: ReleaseNotesMutationObservation | undefined;
  await withReleaseNotesEnv(
    async (env) => {
      const { releaseData, conformant } = input.fixture;
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
          const [replacementSegment] = input.pathSegments;
          replacementArtifactPath = join(
            dirname(stagedPath),
            replacementSegment,
          );
          await writeFile(
            replacementArtifactPath,
            input.replacementContent,
          );
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
      observation = releaseNotesMutationObservation({
        error,
        mutationAttempted,
        actualCanonicalPath: await env.canonicalizePath(resolvedPath),
      });
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
  input: ReleaseNotesExistingSectionInput,
): Promise<ReleaseNotesExistingSectionObservation> {
  const { workingDirectory, readArtifact, canonicalizePath } = env;
  const {
    kind: existingSectionCase,
    releaseData,
    existingNotes,
    generatedNotes,
  } = input;
  const resolvedPath = resolveReleaseNotesPath(workingDirectory, {});
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
  const stagedPromptPath = promptChangelogPath(writingAgent.lastPrompt);
  if (stagedPromptPath === undefined) {
    throw new Error("Release-notes prompt omitted the staged changelog path");
  }
  return {
    error,
    result,
    resolvedPath,
    finalContent: await readArtifact(resolvedPath),
    prompt: writingAgent.lastPrompt,
    stagedPromptPath,
    canonicalOutputPath: await canonicalizePath(resolvedPath),
    promptWorkingDirectory: writingAgent.requests.at(0)?.workingDirectory ?? workingDirectory,
    stagedInput,
    stagedCanonicalPath,
  };
}

export { DEFAULT_CHANGELOG_PATH };
