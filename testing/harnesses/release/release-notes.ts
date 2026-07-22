import { join } from "node:path";

import type { ReleaseData } from "@/domains/release/release-data";
import {
  composeReleaseNotes,
  type ComposeReleaseNotesResult,
  type PathCanonicalizer,
  type ReleaseNotesConfig,
} from "@/domains/release/release-notes";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import type { ReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

type ReleaseNotesAgentRunner = Parameters<typeof composeReleaseNotes>[0]["agentRunner"];
type ReleaseNotesFaithfulnessAuditor = Parameters<typeof composeReleaseNotes>[0]["faithfulnessAuditor"];

interface ComposeReleaseNotesInEnvOptions {
  readonly releaseData: ReleaseData;
  readonly config: ReleaseNotesConfig;
  readonly agentRunner: ReleaseNotesAgentRunner;
  readonly workingDirectory?: string;
  readonly readArtifact?: ReleaseNotesEnv["readArtifact"];
  readonly canonicalizePath?: PathCanonicalizer;
  readonly createArtifactStage?: ReleaseNotesEnv["createArtifactStage"];
  readonly promoteArtifact?: ReleaseNotesEnv["promoteArtifact"];
  readonly faithfulnessAuditor?: ReleaseNotesFaithfulnessAuditor;
}

export async function composeReleaseNotesInEnv(
  env: ReleaseNotesEnv,
  {
    releaseData,
    config,
    agentRunner,
    workingDirectory = env.workingDirectory,
    readArtifact = env.readArtifact,
    canonicalizePath = env.canonicalizePath,
    createArtifactStage = env.createArtifactStage,
    promoteArtifact = env.promoteArtifact,
    faithfulnessAuditor = approvingReleaseNotesFaithfulnessAuditor,
  }: ComposeReleaseNotesInEnvOptions,
): Promise<ComposeReleaseNotesResult> {
  return await composeReleaseNotes({
    releaseData,
    config,
    workingDirectory,
    agentRunner,
    readArtifact,
    createArtifactStage,
    promoteArtifact,
    faithfulnessAuditor,
    canonicalizePath,
    isSymbolicLink: env.isSymbolicLink,
    isFile: env.isFile,
  });
}

export const approvingReleaseNotesFaithfulnessAuditor: ReleaseNotesFaithfulnessAuditor = async () => {};

export function recordingReleaseNotesAgent(
  workingDirectory: string,
  targetPath: string,
  content: string,
): RecordingWritingAgentRunner {
  return new RecordingWritingAgentRunner(workingDirectory, targetPath, content);
}

export async function canonicalRelativeChangelogPath(
  workingDirectory: string,
  configuredPath: string,
  canonicalizePath: PathCanonicalizer,
): Promise<string> {
  const canonicalWorkingDirectory = await canonicalizePath(workingDirectory);
  if (canonicalWorkingDirectory === undefined) {
    throw new Error("Release-notes test working directory cannot be canonicalized");
  }
  return join(canonicalWorkingDirectory, configuredPath);
}
