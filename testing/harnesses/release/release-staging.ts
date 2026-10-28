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
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import type { AgentRunner } from "@/agent/agent-runner";
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

/** How a release ends: it completes, or a stage of it fails after the staging directory exists. */
export const RELEASE_STAGING_OUTCOME = {
  COMPLETED: "completed",
  AGENT_FAILURE: "agent-failure",
  AUDIT_REJECTION: "audit-rejection",
} as const;

export type ReleaseStagingOutcome = (typeof RELEASE_STAGING_OUTCOME)[keyof typeof RELEASE_STAGING_OUTCOME];

/** How a staged release settled: its composition resolved, or it rejected. */
export const RELEASE_STAGING_SETTLEMENT = {
  RESOLVED: "resolved",
  REJECTED: "rejected",
} as const;

export type ReleaseStagingSettlement = (typeof RELEASE_STAGING_SETTLEMENT)[keyof typeof RELEASE_STAGING_SETTLEMENT];

const INJECTED_AGENT_FAILURE_MESSAGE = "Injected agent failure while the staging directory exists";

/** An agent runner whose run fails, so the release ends after staging and before promotion. */
export const failingStagingAgentRunner: AgentRunner = {
  run: async () => {
    throw new Error(INJECTED_AGENT_FAILURE_MESSAGE);
  },
};

const INJECTED_AUDIT_REJECTION_MESSAGE = "Injected faithfulness rejection while the staging directory exists";

const rejectingReleaseNotesFaithfulnessAuditor: Parameters<typeof composeReleaseNotes>[0]["faithfulnessAuditor"] =
  async () => {
    throw new Error(INJECTED_AUDIT_REJECTION_MESSAGE);
  };

/** The staging directories of one release, how it ended, and the run root of the process that ran it. */
export interface ReleaseStagingObservation {
  /** The canonical run root the temp-directory primitive exported to this process, when it exported one. */
  readonly runRoot: string | undefined;
  readonly stages: readonly ObservedStage[];
  /** Whether the release resolved or rejected. */
  readonly settled: ReleaseStagingSettlement;
  /** Directories present in the run root after the release that were absent before it, by any route. */
  readonly strayEntries: readonly string[];
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
  /** Snapshots the run root's entries; call it before the release starts. */
  begin(): Promise<void>;
  /** Reads the recorded stages' current state; call it once the release has finished. */
  observe(settled: ReleaseStagingSettlement): Promise<ReleaseStagingObservation>;
}

async function canonicalOrSelf(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}

async function runRootEntries(): Promise<ReadonlySet<string>> {
  const exportedRunRoot = process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT];
  if (exportedRunRoot === undefined) return new Set();
  const entries = await readdir(exportedRunRoot, { recursive: true, withFileTypes: true }).catch(() => []);
  return new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => join(entry.parentPath, entry.name)),
  );
}

export function createStageRecorder(): StageRecorder {
  const recorded: RecordedStage[] = [];
  let baseline: ReadonlySet<string> = new Set();
  return {
    begin: async () => {
      baseline = await runRootEntries();
    },
    record: (stager) => async (...args) => {
      const stage = await stager(...args);
      const existedWhileStaged = existsSync(stage.workingDirectory);
      recorded.push({ workingDirectory: await canonicalOrSelf(stage.workingDirectory), existedWhileStaged });
      return stage;
    },
    observe: async (settled) => {
      const exportedRunRoot = process.env[TEMP_DIRECTORY_ENV_VAR.RUN_ROOT];
      const after = await runRootEntries();
      return {
        runRoot: exportedRunRoot === undefined ? undefined : await canonicalOrSelf(exportedRunRoot),
        stages: recorded.map(({ workingDirectory, existedWhileStaged }) => ({
          workingDirectory,
          existedWhileStaged,
          existsAfterRelease: existsSync(workingDirectory),
        })),
        settled,
        strayEntries: [...after].filter((entry) => !baseline.has(entry)),
      };
    },
  };
}

/**
 * Composes release notes for `fixture` through the production release-notes filesystem, ending as
 * `outcome` says, and observes the staging directories the composition created.
 */
export async function observeReleaseNotesStaging(
  fixture: ReleaseNotesCompositionFixture,
  outcome: ReleaseStagingOutcome = RELEASE_STAGING_OUTCOME.COMPLETED,
): Promise<ReleaseStagingObservation> {
  let observation: ReleaseStagingObservation | undefined;
  await withReleaseNotesEnv(async (env) => {
    const recorder = createStageRecorder();
    const resolvedPath = resolveReleaseNotesPath(env.workingDirectory, {});
    await recorder.begin();
    let settled: ReleaseStagingSettlement = RELEASE_STAGING_SETTLEMENT.RESOLVED;
    try {
      await composeReleaseNotes({
        releaseData: fixture.releaseData,
        config: {},
        workingDirectory: env.workingDirectory,
        agentRunner: outcome === RELEASE_STAGING_OUTCOME.AGENT_FAILURE
          ? failingStagingAgentRunner
          : releaseDataDrivenAgentRunner(env.workingDirectory, resolvedPath),
        readArtifact: env.readArtifact,
        createArtifactStage: recorder.record(env.createArtifactStage),
        promoteArtifact: env.promoteArtifact,
        faithfulnessAuditor: outcome === RELEASE_STAGING_OUTCOME.AUDIT_REJECTION
          ? rejectingReleaseNotesFaithfulnessAuditor
          : approvingReleaseNotesFaithfulnessAuditor,
        canonicalizePath: env.canonicalizePath,
        isSymbolicLink: env.isSymbolicLink,
        isFile: env.isFile,
      });
    } catch {
      settled = RELEASE_STAGING_SETTLEMENT.REJECTED;
    }
    observation = await recorder.observe(settled);
  });
  if (observation === undefined) {
    throw new Error("Release-notes composition produced no staging observation");
  }
  return observation;
}
