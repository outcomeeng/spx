import type { AgentRunner } from "@/agent/agent-runner";
import { DEFAULT_RELEASE_DOCUMENTATION_PATHS } from "@/domains/release/config";
import type { ReleaseData } from "@/domains/release/release-data";

export const DOCUMENTATION_FILE_EXTENSION = ".md";
export const DOCUMENTATION_SYNC_PROMPT_INSTRUCTION =
  "Update every staged documentation file so its version references and behavior descriptions match the supplied release data.";
export const DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN = "<documentation-sync-input>";
export const DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE = "</documentation-sync-input>";

export interface DocumentationSyncConfig {
  readonly paths?: readonly string[];
}

export interface StagedDocumentation {
  readonly workingDirectory: string;
  readonly documents: readonly {
    readonly sourcePath: string;
    readonly stagedPath: string;
  }[];
  readonly cleanup: () => Promise<void>;
}

export interface DocumentationSyncPromptInput {
  readonly releaseData: ReleaseData;
  readonly documents: StagedDocumentation["documents"];
}

export function buildDocumentationSyncPrompt(
  _input: DocumentationSyncPromptInput,
): string {
  throw new Error("documentation sync prompt assembly is not implemented");
}

export type DocumentationStager = (
  productDir: string,
  paths: readonly string[],
) => Promise<StagedDocumentation>;

export type DocumentationReader = (path: string) => Promise<string>;

export type DocumentationPromoter = (
  documents: readonly { readonly path: string; readonly content: string }[],
) => Promise<void>;

export type DocumentationFaithfulnessAuditor = (
  input: {
    readonly releaseData: ReleaseData;
    readonly documents: readonly { readonly path: string; readonly content: string }[];
  },
) => Promise<void>;

export interface ComposeDocumentationSyncOptions {
  readonly releaseData: ReleaseData;
  readonly config: DocumentationSyncConfig;
  readonly productDir: string;
  readonly agentRunner: AgentRunner;
  readonly stageDocumentation: DocumentationStager;
  readonly readDocument: DocumentationReader;
  readonly promoteDocumentation: DocumentationPromoter;
  readonly faithfulnessAuditor: DocumentationFaithfulnessAuditor;
}

export interface ComposeDocumentationSyncResult {
  readonly paths: readonly string[];
}

export function resolveDocumentationPaths(
  _config: DocumentationSyncConfig,
): readonly string[] {
  void DEFAULT_RELEASE_DOCUMENTATION_PATHS;
  throw new Error("documentation path resolution is not implemented");
}

export async function composeDocumentationSync(
  _options: ComposeDocumentationSyncOptions,
): Promise<ComposeDocumentationSyncResult> {
  throw new Error("documentation sync is not implemented");
}
