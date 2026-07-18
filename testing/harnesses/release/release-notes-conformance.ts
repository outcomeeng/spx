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
}

export async function composeReleaseNotesCase(
  { releaseData, content }: ReleaseNotesChangelogCase,
): Promise<ReleaseNotesConformanceObservation> {
  let observation: ReleaseNotesConformanceObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
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
    observation = { content: await env.readArtifact(resolvedPath), version: releaseData.version };
  });
  if (observation === undefined) throw new Error("Release-notes conformance case produced no observation");
  return observation;
}

export async function composeEveryReleaseNotesCase(
  cases: readonly ReleaseNotesChangelogCase[],
): Promise<readonly ReleaseNotesConformanceFailureObservation[]> {
  return await Promise.all(
    cases.map(async (releaseNotesCase) => {
      try {
        await composeReleaseNotesCase(releaseNotesCase);
        return { error: undefined };
      } catch (error) {
        return { error };
      }
    }),
  );
}
