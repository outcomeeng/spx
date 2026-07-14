import { AGENT_PERMISSION_MODES, AGENT_RUN_TOOLS, type AgentAuditor, type AgentRunner } from "@/agent/agent-runner";
import { DEFAULT_RELEASE_DOCUMENTATION_PATHS, type DocumentationSyncConfig } from "@/domains/release/config";
import { encodeReleasePromptData } from "@/domains/release/prompt-data";
import { type ReleaseData, releaseVersionFromTag } from "@/domains/release/release-data";
import { RELEASE_TAG_PREFIX } from "@/lib/git/release";

export const DOCUMENTATION_FILE_EXTENSION = ".md";
export const DOCUMENTATION_SYNC_PROMPT_INSTRUCTION =
  "Update every staged documentation file so its version references and behavior descriptions match the supplied release data.";
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
const REGEXP_SPECIAL_CHARACTER_PATTERN = /[.*+?^${}()|[\]\\]/gu;
const REGEXP_ESCAPE_REPLACEMENT = String.raw`\$&`;
const VERSION_REFERENCE_DIGIT_BOUNDARY = String.raw`\d`;
const SEMANTIC_VERSION_REFERENCE_PATTERN = /(?<!\d)v?(\d+\.\d+\.\d+)(?!\d)/gu;

export interface StagedDocumentation {
  readonly workingDirectory: string;
  readonly documents: readonly {
    readonly sourcePath: string;
    readonly stagedPath: string;
    readonly targetPath: string;
    readonly originalContent: string;
  }[];
  readonly cleanup: () => Promise<void>;
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
  return `${DOCUMENTATION_SYNC_PROMPT_INSTRUCTION}\n\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN}\n${
    encodeReleasePromptData(input)
  }\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}`;
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
      originalContent,
    }) => {
      const content = await options.readDocument(stagedPath);
      assertReleasedVersionReferencesUpdated(originalContent, content, options.releaseData, sourcePath);
      return { path: sourcePath, targetPath, content };
    }));
    await options.faithfulnessAuditor({
      releaseData: options.releaseData,
      documents: documents.map(({ path, content }) => ({ path, content })),
    });
    await options.promoteDocumentation(
      documents.map(({ targetPath, content }) => ({ path: targetPath, content })),
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
  originalContent: string,
  content: string,
  releaseData: ReleaseData,
  path: string,
): void {
  if (!containsReleaseVersionReference(content, releaseData.version)) {
    throw new Error(`Updated documentation does not reference release version ${releaseData.version}: ${path}`);
  }
  if (releaseData.previousTag === null) {
    assertFirstReleaseVersionReferencesUpdated(originalContent, content, releaseData.version, path);
    return;
  }
  const previousVersion = releaseVersionFromTag(releaseData.previousTag);
  if (containsReleaseVersionReference(content, previousVersion)) {
    throw new Error(`Updated documentation still references previous release version ${previousVersion}: ${path}`);
  }
}

function assertFirstReleaseVersionReferencesUpdated(
  originalContent: string,
  content: string,
  releaseVersion: string,
  path: string,
): void {
  const originalReferences = semanticVersionReferences(originalContent);
  const updatedReferences = semanticVersionReferences(content);

  for (const version of originalReferences) {
    if (version === releaseVersion) continue;
    if (updatedReferences.has(version)) {
      throw new Error(`Updated documentation still references prior version ${version}: ${path}`);
    }
  }
}

function semanticVersionReferences(content: string): ReadonlySet<string> {
  const references = new Set<string>();
  for (const match of content.matchAll(SEMANTIC_VERSION_REFERENCE_PATTERN)) {
    references.add(match[1]);
  }
  return references;
}

function containsReleaseVersionReference(content: string, version: string): boolean {
  const escapedVersion = version.replace(REGEXP_SPECIAL_CHARACTER_PATTERN, REGEXP_ESCAPE_REPLACEMENT);
  return new RegExp(
    `(?<!${VERSION_REFERENCE_DIGIT_BOUNDARY})${RELEASE_TAG_PREFIX}?${escapedVersion}(?!${VERSION_REFERENCE_DIGIT_BOUNDARY})`,
    "u",
  ).test(content);
}

function buildDocumentationFaithfulnessAuditPrompt(
  input: Parameters<DocumentationFaithfulnessAuditor>[0],
): string {
  return [
    "Audit whether every documentation change is supported by the supplied release data.",
    `Return exactly ${DOCUMENTATION_SYNC_AUDIT_APPROVED} when every changed claim is supported.`,
    `Return ${DOCUMENTATION_SYNC_AUDIT_REJECTED} followed by a concise reason for any unsupported or omitted release claim.`,
    DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN,
    encodeReleasePromptData(input),
    DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  ].join("\n\n");
}
