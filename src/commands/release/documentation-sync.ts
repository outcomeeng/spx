import type { AgentRunner } from "@/agent/agent-runner";
import {
  composeDocumentationSync,
  type DocumentationFaithfulnessAuditor,
  type DocumentationPromoter,
  type DocumentationReader,
  type DocumentationStager,
  type DocumentationSyncConfig,
} from "@/domains/release/documentation-sync";
import type { ReleaseData } from "@/domains/release/release-data";

export interface DocumentationSyncCommandOptions {
  readonly productDir: string;
  readonly agentRunner: AgentRunner;
  readonly faithfulnessAuditor: DocumentationFaithfulnessAuditor;
}

export interface DocumentationSyncCommandDependencies {
  readonly resolveReleaseData: (productDir: string) => Promise<ReleaseData>;
  readonly resolveDocumentationConfig: (productDir: string) => Promise<DocumentationSyncConfig>;
  readonly stageDocumentation: DocumentationStager;
  readonly readDocument: DocumentationReader;
  readonly promoteDocumentation: DocumentationPromoter;
}

export const UNIMPLEMENTED_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES: DocumentationSyncCommandDependencies = {
  resolveReleaseData: () => Promise.reject(new Error("documentation sync release data is not implemented")),
  resolveDocumentationConfig: () => Promise.reject(new Error("documentation sync config is not implemented")),
  stageDocumentation: () => Promise.reject(new Error("documentation sync staging is not implemented")),
  readDocument: () => Promise.reject(new Error("documentation sync reading is not implemented")),
  promoteDocumentation: () => Promise.reject(new Error("documentation sync promotion is not implemented")),
};

export async function documentationSyncCommand(
  options: DocumentationSyncCommandOptions,
  deps: DocumentationSyncCommandDependencies = UNIMPLEMENTED_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
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
