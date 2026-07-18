import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AgentRunner } from "@/agent/agent-runner";
import { computeReleaseData, type ReleaseData } from "@/domains/release/release-data";
import {
  composeReleaseNotes,
  type ReleaseNotesConfig,
  type ReleaseNotesFaithfulnessAuditor,
} from "@/domains/release/release-notes";
import type { GitDependencies } from "@/lib/git/root";
import { createReleaseNotesFilesystem, type ReleaseNotesFilesystem } from "./release-notes-filesystem";

const PACKAGE_MANIFEST = "package.json";
export const RELEASE_NOTES_OUTPUT_PREFIX = "Generated release notes";

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
  return `${RELEASE_NOTES_OUTPUT_PREFIX}: ${result.changelogPath}`;
}

export async function readPackageVersion(productDir: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(productDir, PACKAGE_MANIFEST), "utf8"),
  ) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.trim().length === 0) {
    throw new Error("package.json version must be a non-empty string");
  }
  return manifest.version;
}
