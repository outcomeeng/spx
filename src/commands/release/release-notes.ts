import type { AgentRunner } from "@/agent/agent-runner";
import { resolveConfig } from "@/config/index";
import {
  RELEASE_SECTION,
  type ReleaseConfig,
  releaseConfigDescriptor,
  type ReleaseNotesPolicyConfig,
} from "@/domains/release/config";
import { computeReleaseData, type ReleaseData } from "@/domains/release/release-data";
import {
  composeReleaseNotes,
  type ReleaseNotesConfig,
  type ReleaseNotesFaithfulnessAuditor,
} from "@/domains/release/release-notes";
import type { GitDependencies } from "@/lib/git/root";

import { readPackageVersion } from "./package-manifest";
import { createReleaseNotesFilesystem, type ReleaseNotesFilesystem } from "./release-notes-filesystem";

export interface ReleaseNotesCommandOptions {
  readonly productDir: string;
  readonly config: ReleaseNotesConfig;
  readonly packageVersion?: string;
  readonly releaseData?: ReleaseData;
  readonly gitDeps?: GitDependencies;
  readonly agentRunner: AgentRunner;
  /**
   * Built from the resolved configuration rather than supplied ready-made, so
   * the producer prompt and the audit prompt read the same withheld type set.
   */
  readonly createFaithfulnessAuditor: (
    config: ReleaseNotesConfig,
  ) => ReleaseNotesFaithfulnessAuditor;
  readonly filesystem?: ReleaseNotesFilesystem;
}

export interface ReleaseNotesCommandDependencies {
  readonly resolveReleaseNotesPolicy: (productDir: string) => Promise<ReleaseNotesPolicyConfig>;
}

export const DEFAULT_RELEASE_NOTES_COMMAND_DEPENDENCIES: ReleaseNotesCommandDependencies = {
  resolveReleaseNotesPolicy: async (productDir) => {
    const loaded = await resolveConfig(productDir, [releaseConfigDescriptor]);
    if (!loaded.ok) throw new Error(loaded.error);
    return (loaded.value[RELEASE_SECTION] as ReleaseConfig).notes;
  },
};

export async function releaseNotesCommand(
  options: ReleaseNotesCommandOptions,
  deps: ReleaseNotesCommandDependencies = DEFAULT_RELEASE_NOTES_COMMAND_DEPENDENCIES,
): Promise<string> {
  const [releaseData, policy] = await Promise.all([
    options.releaseData ?? computeReleaseData({
      productDir: options.productDir,
      packageVersion: options.packageVersion ?? await readPackageVersion(options.productDir),
      deps: options.gitDeps,
    }),
    deps.resolveReleaseNotesPolicy(options.productDir),
  ]);
  const config: ReleaseNotesConfig = {
    ...options.config,
    withheldCommitTypes: options.config.withheldCommitTypes ?? policy.withheldCommitTypes,
  };
  const filesystem = options.filesystem ?? createReleaseNotesFilesystem();
  const result = await composeReleaseNotes({
    releaseData,
    config,
    workingDirectory: options.productDir,
    agentRunner: options.agentRunner,
    readArtifact: filesystem.readArtifact,
    createArtifactStage: filesystem.createArtifactStage,
    promoteArtifact: filesystem.promoteArtifact,
    faithfulnessAuditor: options.createFaithfulnessAuditor(config),
    canonicalizePath: filesystem.canonicalizePath,
    isSymbolicLink: filesystem.isSymbolicLink,
    isFile: filesystem.isFile,
  });
  return result.changelogPath;
}
