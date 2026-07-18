import { join } from "node:path";

import type { ReleaseData } from "@/domains/release/release-data";
import {
  composeReleaseNotes,
  type ComposeReleaseNotesResult,
  type PathCanonicalizer,
  type ReleaseNotesConfig,
} from "@/domains/release/release-notes";
import { arbitraryConformantChangelog } from "@testing/generators/release/changelog";
import { RELEASE_TEST_GENERATOR, sampleReleaseTestValue } from "@testing/generators/release/release";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import type { ReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

type ReleaseNotesAgentRunner = Parameters<typeof composeReleaseNotes>[0]["agentRunner"];
type ReleaseNotesFaithfulnessAuditor = Parameters<typeof composeReleaseNotes>[0]["faithfulnessAuditor"];

export interface ReleaseNotesCompositionFixture {
  readonly releaseData: ReleaseData;
  readonly subjects: readonly string[];
  readonly conformant: string;
}

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

export function sampleReleaseNotesCompositionFixture(
  releaseData = sampleReleaseTestValue(RELEASE_TEST_GENERATOR.releaseData()),
): ReleaseNotesCompositionFixture {
  const subjects = releaseData.commits.map((commit) => commit.subject);
  return {
    releaseData,
    subjects,
    conformant: sampleReleaseTestValue(
      arbitraryConformantChangelog(releaseData.version, subjects),
    ),
  };
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

export async function expectedCanonicalRelativeChangelogPath(
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
