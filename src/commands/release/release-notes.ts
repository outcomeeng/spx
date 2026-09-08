import type { AgentRunner } from "@/agent/agent-runner";
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
  readonly faithfulnessAuditor: ReleaseNotesFaithfulnessAuditor;
  readonly filesystem?: ReleaseNotesFilesystem;
}

export async function releaseNotesCommand(options: ReleaseNotesCommandOptions): Promise<string> {
  const releaseData = options.releaseData ?? await computeReleaseData({
    productDir: options.productDir,
    packageVersion: options.packageVersion ?? await readPackageVersion(options.productDir),
    deps: options.gitDeps,
  });
  const filesystem = options.filesystem ?? createReleaseNotesFilesystem();
  const result = await composeReleaseNotes({
    releaseData,
    config: options.config,
    workingDirectory: options.productDir,
    agentRunner: options.agentRunner,
    readArtifact: filesystem.readArtifact,
    createArtifactStage: filesystem.createArtifactStage,
    promoteArtifact: filesystem.promoteArtifact,
    faithfulnessAuditor: options.faithfulnessAuditor,
    canonicalizePath: filesystem.canonicalizePath,
    isSymbolicLink: filesystem.isSymbolicLink,
    isFile: filesystem.isFile,
  });
  return result.changelogPath;
}
