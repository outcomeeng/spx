import type { AgentRunner } from "@/agent/agent-runner";
import { resolveConfig } from "@/config/index";
import {
  type DocumentationSyncConfig,
  RELEASE_SECTION,
  type ReleaseConfig,
  releaseConfigDescriptor,
} from "@/domains/release/config";
import {
  composeDocumentationSync,
  type DocumentationFaithfulnessAuditor,
  type DocumentationPromoter,
  type DocumentationStager,
  type StagedDocumentationReader,
} from "@/domains/release/documentation-sync";
import { computeReleaseData, type ReleaseData } from "@/domains/release/release-data";

import { createDocumentationSyncFilesystem } from "./documentation-sync-filesystem";
import { readPackageVersion } from "./release-notes";

export interface DocumentationSyncCommandOptions {
  readonly productDir: string;
  readonly agentRunner: AgentRunner;
  readonly faithfulnessAuditor: DocumentationFaithfulnessAuditor;
}

export interface DocumentationSyncCommandDependencies {
  readonly resolveReleaseData: (productDir: string) => Promise<ReleaseData>;
  readonly resolveDocumentationConfig: (productDir: string) => Promise<DocumentationSyncConfig>;
  readonly stageDocumentation: DocumentationStager;
  readonly readDocument: StagedDocumentationReader;
  readonly promoteDocumentation: DocumentationPromoter;
}

const documentationSyncFilesystem = createDocumentationSyncFilesystem();

export const DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES: DocumentationSyncCommandDependencies = {
  resolveReleaseData: async (productDir) =>
    await computeReleaseData({
      productDir,
      packageVersion: await readPackageVersion(productDir),
    }),
  resolveDocumentationConfig: async (productDir) => {
    const loaded = await resolveConfig(productDir, [releaseConfigDescriptor]);
    if (!loaded.ok) throw new Error(loaded.error);
    return (loaded.value[RELEASE_SECTION] as ReleaseConfig).documentation;
  },
  stageDocumentation: documentationSyncFilesystem.stageDocumentation,
  readDocument: documentationSyncFilesystem.readDocument,
  promoteDocumentation: documentationSyncFilesystem.promoteDocumentation,
};

export async function documentationSyncCommand(
  options: DocumentationSyncCommandOptions,
  deps: DocumentationSyncCommandDependencies = DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
): Promise<readonly string[]> {
  const [releaseData, config] = await Promise.all([
    deps.resolveReleaseData(options.productDir),
    deps.resolveDocumentationConfig(options.productDir),
  ]);
  const result = await composeDocumentationSync({
    releaseData,
    config,
    productDir: options.productDir,
    agentRunner: options.agentRunner,
    stageDocumentation: deps.stageDocumentation,
    readDocument: deps.readDocument,
    promoteDocumentation: deps.promoteDocumentation,
    faithfulnessAuditor: options.faithfulnessAuditor,
  });
  return result.paths;
}
