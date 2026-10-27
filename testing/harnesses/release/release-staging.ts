/**
 * Release staging harness: drives a completed release-notes composition over the production
 * filesystem boundary and records where each staging directory lived and whether it still exists once
 * the release has finished.
 *
 * The recorder wraps a stager, delegates to it unchanged, and notes the staging directory the stager
 * returned. It returns observations only: it asserts nothing and returns no verdict.
 *
 * @module testing/harnesses/release/release-staging
 */

import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";

import { composeReleaseNotes, resolveReleaseNotesPath } from "@/domains/release/release-notes";
import { TEMP_DIRECTORY_ENV_VAR } from "@/lib/temp-directory";
import type { ReleaseNotesCompositionFixture } from "@testing/generators/release/release-notes";
import { releaseDataDrivenAgentRunner } from "@testing/harnesses/release/agent-runner";
import { approvingReleaseNotesFaithfulnessAuditor } from "@testing/harnesses/release/release-notes";
import { withReleaseNotesEnv } from "@testing/harnesses/release/release-notes-env";

/** One staging directory a release created. */
export interface ObservedStage {
  /** The canonical path of the staging directory. */
  readonly workingDirectory: string;
  /** Whether the directory existed right after the stager returned it. */
  readonly existedWhileStaged: boolean;
  /** Whether the directory still existed once the release had finished. */
  readonly existsAfterRelease: boolean;
}

/** The staging directories of one completed release and the run root of the process that ran it. */
export interface ReleaseStagingObservation {
  /** The canonical run root the temp-directory primitive exported to this process, when it exported one. */
  readonly runRoot: string | undefined;
  readonly stages: readonly ObservedStage[];
}

interface RecordedStage {
  readonly workingDirectory: string;
  readonly existedWhileStaged: boolean;
}

export interface StageRecorder {
  /** Wraps `stager` so that every staging directory it returns is recorded; the stage passes through unchanged. */
  record<Args extends unknown[], Stage extends { readonly workingDirectory: string }>(
    stager: (...args: Args) => Promise<Stage>,
  ): (...args: Args) => Promise<Stage>;
  /** Reads the recorded stages' current state; call it once the release has finished. */
  observe(): Promise<ReleaseStagingObservation>;
}

async function canonicalOrSelf(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}

export function createStageRecorder(): StageRecorder {
  const recorded: RecordedStage[] = [];
  return {
    record: (stager) => async (...args) => {
      const stage = await stager(...args);
      const existedWhileStaged = existsSync(stage.workingDirectory);
      recorded.push({ workingDirectory: await canonicalOrSelf(stage.workingDirectory), existedWhileStaged });
      return stage;
    },
    observe: async () => {
      const exportedRunRoot = process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT];
      return {
        runRoot: exportedRunRoot === undefined ? undefined : await canonicalOrSelf(exportedRunRoot),
        stages: recorded.map(({ workingDirectory, existedWhileStaged }) => ({
          workingDirectory,
          existedWhileStaged,
          existsAfterRelease: existsSync(workingDirectory),
        })),
      };
    },
  };
}

/**
 * Composes release notes for `fixture` through the production release-notes filesystem and observes
 * the staging directories the composition created.
 */
export async function observeReleaseNotesStaging(
  fixture: ReleaseNotesCompositionFixture,
): Promise<ReleaseStagingObservation> {
  let observation: ReleaseStagingObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const recorder = createStageRecorder();
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    await composeReleaseNotes({
      releaseData: fixture.releaseData,
      config: {},
      workingDirectory: env.workingDirectory,
      agentRunner: releaseDataDrivenAgentRunner(env.workingDirectory, resolvedPath),
      readArtifact: env.readArtifact,
      createArtifactStage: recorder.record(env.createArtifactStage),
      promoteArtifact: env.promoteArtifact,
      faithfulnessAuditor: approvingReleaseNotesFaithfulnessAuditor,
      canonicalizePath: env.canonicalizePath,
      isSymbolicLink: env.isSymbolicLink,
      isFile: env.isFile,
    });
    observation = await recorder.observe();
  });
  if (observation === undefined) {
    throw new Error("Release-notes composition produced no staging observation");
  }
  return observation;
}
