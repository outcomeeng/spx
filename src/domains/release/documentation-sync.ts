import { AGENT_PERMISSION_MODES, AGENT_RUN_TOOLS, type AgentAuditor, type AgentRunner } from "@/agent/agent-runner";
import { DEFAULT_RELEASE_DOCUMENTATION_PATHS, type DocumentationSyncConfig } from "@/domains/release/config";
import { encodeReleasePromptData } from "@/domains/release/prompt-data";
import { type ReleaseData, releaseVersionFromTag } from "@/domains/release/release-data";
import { RELEASE_TAG_PREFIX } from "@/lib/git/release";

export const DOCUMENTATION_FILE_EXTENSION = ".md";
export const DOCUMENTATION_SYNC_PROMPT_INSTRUCTION =
  "Edit every staged documentation file so its version references and behavior descriptions match the supplied release data.";
const DOCUMENTATION_SYNC_RELEASE_VERSION_INSTRUCTION =
  "The exact released version every staged document must contain is";
const DOCUMENTATION_SYNC_VERSIONLESS_INSTRUCTION =
  "Replace every standalone previous product release-version reference. When a staged document has no such reference, add a concise current-release reference using the exact released version above.";
export const DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN = "<documentation-sync-input>";
export const DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE = "</documentation-sync-input>";
export const DOCUMENTATION_SYNC_AGENT_TOOLS = [
  AGENT_RUN_TOOLS.READ,
  AGENT_RUN_TOOLS.WRITE,
  AGENT_RUN_TOOLS.EDIT,
] as const;
export const DOCUMENTATION_SYNC_AGENT_PERMISSION_MODE = AGENT_PERMISSION_MODES.DONT_ASK;
export const DOCUMENTATION_SYNC_AGENT_MAX_TURNS = 10;
export const DOCUMENTATION_SYNC_AUDIT_MAX_TURNS = 3;
export const DOCUMENTATION_SYNC_AUDIT_APPROVED = "APPROVED";
export const DOCUMENTATION_SYNC_AUDIT_REJECTED = "REJECTED";
export const DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION =
  "When an original document has no previous-release reference, adding a concise current-release reference using the exact released version is a supported release update.";
const REGEXP_SPECIAL_CHARACTER_PATTERN = /[.*+?^${}()|[\]\\]/gu;
const REGEXP_ESCAPE_REPLACEMENT = String.raw`\$&`;
const VERSION_REFERENCE_NON_WHITESPACE_PATTERN = String.raw`\S`;
const JSON_LEFT_ANGLE_BRACKET_PATTERN = /</gu;
const JSON_LEFT_ANGLE_BRACKET_ESCAPE = String.raw`\u003c`;

export interface StagedDocumentation {
  readonly workingDirectory: string;
  readonly documents: readonly {
    readonly sourcePath: string;
    readonly stagedPath: string;
    readonly targetPath: string;
    readonly originalIdentity: DocumentationFileIdentity;
    readonly originalContent: string;
  }[];
  readonly cleanup: () => Promise<void>;
}

export interface DocumentationFileIdentity {
  readonly device: number;
  readonly inode: number;
}

export interface DocumentationSyncPromptInput {
  readonly releaseData: ReleaseData;
  readonly documents: readonly {
    readonly sourcePath: string;
    readonly stagedPath: string;
  }[];
}

export function buildDocumentationSyncPrompt(
  input: DocumentationSyncPromptInput,
): string {
  const encodedVersion = JSON.stringify(input.releaseData.version).replace(
    JSON_LEFT_ANGLE_BRACKET_PATTERN,
    JSON_LEFT_ANGLE_BRACKET_ESCAPE,
  );
  return `${DOCUMENTATION_SYNC_PROMPT_INSTRUCTION}\n${DOCUMENTATION_SYNC_RELEASE_VERSION_INSTRUCTION} ${encodedVersion}.\n${DOCUMENTATION_SYNC_VERSIONLESS_INSTRUCTION}\n\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN}\n${
    encodeReleasePromptData(input)
  }\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}`;
}

export type DocumentationStager = (
  productDir: string,
  paths: readonly string[],
) => Promise<StagedDocumentation>;

export type StagedDocumentationReader = (workingDirectory: string, path: string) => Promise<string>;

export interface DocumentationPromotion {
  readonly path: string;
  readonly originalIdentity: DocumentationFileIdentity;
  readonly originalContent: string;
  readonly content: string;
}

export type DocumentationPromoter = (documents: readonly DocumentationPromotion[]) => Promise<void>;

export type DocumentationFaithfulnessAuditor = (
  input: {
    readonly releaseData: ReleaseData;
    readonly documents: readonly {
      readonly path: string;
      readonly originalContent: string;
      readonly updatedContent: string;
    }[];
  },
) => Promise<void>;

export interface ComposeDocumentationSyncOptions {
  readonly releaseData: ReleaseData;
  readonly config: DocumentationSyncConfig;
  readonly productDir: string;
  readonly agentRunner: AgentRunner;
  readonly stageDocumentation: DocumentationStager;
  readonly readDocument: StagedDocumentationReader;
  readonly promoteDocumentation: DocumentationPromoter;
  readonly faithfulnessAuditor: DocumentationFaithfulnessAuditor;
}

export interface ComposeDocumentationSyncResult {
  readonly paths: readonly string[];
}

export function resolveDocumentationPaths(
  config: DocumentationSyncConfig,
): readonly string[] {
  return config.paths ?? DEFAULT_RELEASE_DOCUMENTATION_PATHS;
}

export async function composeDocumentationSync(
  options: ComposeDocumentationSyncOptions,
): Promise<ComposeDocumentationSyncResult> {
  const paths = resolveDocumentationPaths(options.config);
  const stage = await options.stageDocumentation(options.productDir, paths);
  try {
    const promptDocuments = stage.documents.map(({ sourcePath, stagedPath }) => ({ sourcePath, stagedPath }));
    await options.agentRunner.run({
      prompt: buildDocumentationSyncPrompt({ releaseData: options.releaseData, documents: promptDocuments }),
      workingDirectory: stage.workingDirectory,
      tools: DOCUMENTATION_SYNC_AGENT_TOOLS,
      allowedTools: DOCUMENTATION_SYNC_AGENT_TOOLS,
      permissionMode: DOCUMENTATION_SYNC_AGENT_PERMISSION_MODE,
      maxTurns: DOCUMENTATION_SYNC_AGENT_MAX_TURNS,
    });
    const documents = await Promise.all(stage.documents.map(async ({
      sourcePath,
      stagedPath,
      targetPath,
      originalIdentity,
      originalContent,
    }) => {
      const updatedContent = await options.readDocument(stage.workingDirectory, stagedPath);
      assertReleasedVersionReferencesUpdated(updatedContent, options.releaseData, sourcePath);
      return { path: sourcePath, targetPath, originalIdentity, originalContent, updatedContent };
    }));
    await options.faithfulnessAuditor({
      releaseData: options.releaseData,
      documents: documents.map(({ path, originalContent, updatedContent }) => ({
        path,
        originalContent,
        updatedContent,
      })),
    });
    await options.promoteDocumentation(
      documents.map(({ targetPath, originalIdentity, originalContent, updatedContent }) => ({
        path: targetPath,
        originalIdentity,
        originalContent,
        content: updatedContent,
      })),
    );
    return { paths };
  } finally {
    await stage.cleanup();
  }
}

export function createDocumentationFaithfulnessAuditor(
  agentAuditor: AgentAuditor,
  workingDirectory: string,
): DocumentationFaithfulnessAuditor {
  return async (input) => {
    const verdict = (await agentAuditor.audit({
      prompt: buildDocumentationFaithfulnessAuditPrompt(input),
      workingDirectory,
      maxTurns: DOCUMENTATION_SYNC_AUDIT_MAX_TURNS,
    })).trim();
    if (verdict === DOCUMENTATION_SYNC_AUDIT_APPROVED) return;
    if (
      verdict === DOCUMENTATION_SYNC_AUDIT_REJECTED
      || verdict.startsWith(`${DOCUMENTATION_SYNC_AUDIT_REJECTED} `)
    ) {
      throw new Error(`Documentation faithfulness audit rejected the update: ${verdict}`);
    }
    throw new Error(`Documentation faithfulness audit returned an invalid verdict: ${verdict}`);
  };
}

function assertReleasedVersionReferencesUpdated(
  content: string,
  releaseData: ReleaseData,
  path: string,
): void {
  if (!containsReleaseVersionReference(content, releaseData.version)) {
    throw new Error(`Updated documentation does not reference release version ${releaseData.version}: ${path}`);
  }
  if (releaseData.previousTag === null) return;
  const previousVersion = releaseVersionFromTag(releaseData.previousTag);
  if (containsReleaseVersionReference(content, previousVersion)) {
    throw new Error(`Updated documentation still references previous release version ${previousVersion}: ${path}`);
  }
}

function containsReleaseVersionReference(content: string, version: string): boolean {
  const escapedVersion = version.replace(REGEXP_SPECIAL_CHARACTER_PATTERN, REGEXP_ESCAPE_REPLACEMENT);
  return new RegExp(
    `(?<!${VERSION_REFERENCE_NON_WHITESPACE_PATTERN})${RELEASE_TAG_PREFIX}?${escapedVersion}(?!${VERSION_REFERENCE_NON_WHITESPACE_PATTERN})`,
    "u",
  ).test(content);
}

function buildDocumentationFaithfulnessAuditPrompt(
  input: Parameters<DocumentationFaithfulnessAuditor>[0],
): string {
  return [
    "Audit whether every original-to-updated documentation transformation faithfully applies the supplied release data, including updating each previous-release reference rather than deleting it.",
    DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION,
    `Return exactly ${DOCUMENTATION_SYNC_AUDIT_APPROVED} when every changed claim is supported and every previous-release reference remains represented by the released version.`,
    `Return ${DOCUMENTATION_SYNC_AUDIT_REJECTED} followed by a concise reason for any unsupported claim, deleted previous-release reference, or omitted release update.`,
    DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN,
    encodeReleasePromptData(input),
    DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  ].join("\n\n");
}
