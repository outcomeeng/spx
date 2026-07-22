import type { ReleaseData } from "@/domains/release/release-data";
import { composeReleaseNotes, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import { RecordingWritingAgentRunner } from "@testing/harnesses/release/agent-runner";
import { approvingReleaseNotesFaithfulnessAuditor } from "@testing/harnesses/release/release-notes";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

export interface ReleaseNotesChangelogCase {
  readonly releaseData: ReleaseData;
  readonly content: string;
}

export interface ReleaseNotesConformanceObservation {
  readonly content: string;
  readonly version: string;
}

export interface ReleaseNotesConformanceFailureObservation {
  readonly error: unknown;
  readonly finalPathIsFile: boolean;
}

interface ReleaseNotesCompositionObservation extends ReleaseNotesConformanceFailureObservation {
  readonly content: string | undefined;
  readonly version: string;
}

export async function composeReleaseNotesCase(
  { releaseData, content }: ReleaseNotesChangelogCase,
): Promise<ReleaseNotesConformanceObservation> {
  const observation = await observeReleaseNotesComposition({ releaseData, content });
  if (observation.error !== undefined) throw observation.error;
  if (observation.content === undefined) {
    throw new Error("Release-notes conformance case produced no content");
  }
  return { content: observation.content, version: observation.version };
}

async function observeReleaseNotesComposition(
  { releaseData, content }: ReleaseNotesChangelogCase,
): Promise<ReleaseNotesCompositionObservation> {
  let observation: ReleaseNotesCompositionObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    let error: unknown;
    try {
      await composeReleaseNotes({
        releaseData,
        config: {},
        workingDirectory: env.workingDirectory,
        agentRunner: new RecordingWritingAgentRunner(env.workingDirectory, resolvedPath, content),
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
    const finalPathIsFile = await env.isFile(resolvedPath);
    observation = {
      error,
      finalPathIsFile,
      content: finalPathIsFile ? await env.readArtifact(resolvedPath) : undefined,
      version: releaseData.version,
    };
  });
  if (observation === undefined) throw new Error("Release-notes conformance case produced no observation");
  return observation;
}

export async function composeEveryReleaseNotesCase(
  cases: readonly ReleaseNotesChangelogCase[],
): Promise<readonly ReleaseNotesConformanceFailureObservation[]> {
  return await Promise.all(
    cases.map(async (releaseNotesCase) => await observeReleaseNotesComposition(releaseNotesCase)),
  );
}
