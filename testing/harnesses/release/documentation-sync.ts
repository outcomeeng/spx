import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, win32 } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { Command } from "commander";
import { execa } from "execa";

import {
  AGENT_PERMISSION_MODES,
  AGENT_TOOL_PERMISSION_BEHAVIOR,
  type AgentAuditor,
  type AgentAuditRequest,
  type AgentRunner,
  type AgentRunRequest,
} from "@/agent/agent-runner";
import {
  AGENT_FILE_TOOL_PATH_INPUT_FIELD,
  AGENT_PRE_TOOL_USE_HOOK_EVENT,
  createAgentRunOptions,
} from "@/agent/claude-agent-runner";
import { DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES } from "@/commands/release/documentation-sync";
import {
  createDocumentationAtomicWriter,
  createDocumentationSyncFilesystem,
  DOCUMENTATION_TEXT_ENCODING,
  type DocumentationAtomicWriter,
  type DocumentationCanonicalPathResolver,
  type DocumentationFileOpener,
  type DocumentationReplacementGuard,
  type DocumentationSyncFilesystem,
  resolveCanonicalDocumentationTarget,
} from "@/commands/release/documentation-sync-filesystem";
import { CONFIG_FILE_FORMAT, DEFAULT_CONFIG_FILENAME, serializeConfigFileSections } from "@/config/index";
import { DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import {
  DEFAULT_RELEASE_DOCUMENTATION_PATHS,
  RELEASE_CONFIG_FIELDS,
  RELEASE_SECTION,
  releaseConfigDescriptor,
} from "@/domains/release/config";
import {
  composeDocumentationSync,
  type ComposeDocumentationSyncOptions,
  createDocumentationFaithfulnessAuditor,
  DOCUMENTATION_SYNC_AUDIT_APPROVED,
  DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN,
  DOCUMENTATION_SYNC_PROMPT_INSTRUCTION,
  type DocumentationFaithfulnessAuditor,
  type DocumentationFileIdentity,
  type DocumentationPromoter,
  type StagedDocumentationReader,
} from "@/domains/release/documentation-sync";
import { encodeReleasePromptData } from "@/domains/release/prompt-data";
import { type ReleaseData, releaseVersionFromTag } from "@/domains/release/release-data";
import { type CliInvocation, SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createReleaseDomain, RELEASE_CLI } from "@/interfaces/cli/release";
import type { AtomicWriteFileSystem } from "@/lib/atomic-file-write";
import { isPathContained } from "@/lib/file-system/pathContainment";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import {
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryDefaultDocumentationSyncScenario,
  arbitraryDocumentationAgentFileToolBoundaryScenario,
  arbitraryDocumentationPathAliasCases,
  arbitraryDocumentationVersionPreservationScenarios,
  arbitraryDuplicateDocumentationPathSet,
  arbitraryFirstReleaseDocumentationSyncScenario,
  arbitraryMultiDocumentSyncScenario,
  arbitraryNestedDocumentationSyncScenario,
  arbitraryPromptBoundaryDocumentationSyncScenario,
  arbitraryReleaseVersionVariantOnlyScenario,
  arbitrarySingleDocumentSyncScenario,
  arbitrarySparseDocumentationPathSet,
  arbitraryUnrelatedVersionRewriteScenario,
  arbitraryVersionlessSubsequentReleaseDocumentationSyncScenario,
  DOCUMENTATION_PATH_FAILURE_KIND,
  type DocumentationAgentFileToolBoundaryScenario,
  type DocumentationPathAliasCase,
  type DocumentationPathFailureCase,
  documentationPathFailureCases,
  type DocumentationPathMappingCase,
  documentationPathMappingCases,
  type DocumentationSyncScenario,
  type DocumentationUnrelatedVersionRewriteScenario,
  type DocumentationUpdatedContent,
  type DocumentationVersionPreservationScenarios,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PRODUCT_DIRECTORY_PREFIX = "spx-documentation-sync-";
const EXTERNAL_DIRECTORY_PREFIX = "spx-documentation-sync-external-";
const DOCUMENTATION_FIFO_COMMAND = "mkfifo";
const DOCUMENTATION_FIFO_BLOCK_DETECTION_MS = 100;
const DOCUMENTATION_FIFO_STAGE_OUTCOME = {
  BLOCKED: "blocked",
  REJECTED: "rejected",
  RESOLVED: "resolved",
} as const;
const DOCUMENTATION_READ_RACE_TARGET = {
  PRODUCT: "product",
  STAGED: "staged",
} as const;
const DOCUMENTATION_PATH_SEMANTICS = [
  {
    label: "POSIX",
    join: posix.join,
    operations: {
      isAbsolute: posix.isAbsolute,
      relative: posix.relative,
      resolve: posix.resolve,
      sep: posix.sep,
    },
  },
  {
    label: "Windows",
    join: win32.join,
    operations: {
      isAbsolute: win32.isAbsolute,
      relative: win32.relative,
      resolve: win32.resolve,
      sep: win32.sep,
    },
  },
] as const;

class DocumentationWritingAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  constructor(private readonly updated: DocumentationSyncScenario["updated"]) {}

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    const input = parseDocumentationSyncPromptInput(request.prompt);
    await writeGeneratedDocumentation(this.updated, input.documents);
  }
}

class FirstDocumentationWritingAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  constructor(private readonly updated: DocumentationSyncScenario["updated"]) {}

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    const input = parseDocumentationSyncPromptInput(request.prompt);
    await writeGeneratedDocumentation(this.updated, input.documents.slice(0, 1));
  }
}

class PartiallyUpdatingDocumentationAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    const input = parseDocumentationSyncPromptInput(request.prompt);
    await writeFirstReleasedVersionReference(input.releaseData, input.documents);
  }
}

class PassiveDocumentationAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
  }
}

class StagedSymlinkReplacingAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  constructor(
    private readonly updated: DocumentationSyncScenario["updated"],
    private readonly sourcePath: string,
    private readonly externalPath: string,
  ) {}

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    const input = parseDocumentationSyncPromptInput(request.prompt);
    await writeGeneratedDocumentation(this.updated, input.documents);
    const stagedDocument = input.documents.find(({ sourcePath }) => sourcePath === this.sourcePath);
    const externalContent = this.updated[this.sourcePath];
    if (stagedDocument === undefined || externalContent === undefined) {
      throw new Error(`No generated staged documentation for ${this.sourcePath}`);
    }
    await mkdir(dirname(this.externalPath), { recursive: true });
    await writeFile(this.externalPath, externalContent);
    await rm(stagedDocument.stagedPath);
    await symlink(this.externalPath, stagedDocument.stagedPath, "file");
  }
}

class FailingDocumentationAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    throw new Error("Documentation generation failed");
  }
}

class RecordingDocumentationPromoter {
  readonly calls: Parameters<DocumentationPromoter>[0][] = [];

  readonly promote: DocumentationPromoter = async (documents) => {
    this.calls.push(documents);
  };
}

class FailingSecondDocumentationAtomicWriter {
  successfulWrites = 0;
  failures = 0;

  readonly write: DocumentationAtomicWriter = async (path, content, guard) => {
    if (this.successfulWrites === 1 && this.failures === 0) {
      this.failures += 1;
      throw new Error("Second documentation promotion failed");
    }
    const promotedIdentity = await writeDocumentationAfterGuard(path, content, guard);
    this.successfulWrites += 1;
    return promotedIdentity;
  };
}

class RecordingDocumentationAtomicWriter {
  writes = 0;

  readonly write: DocumentationAtomicWriter = async (path, content, guard) => {
    const promotedIdentity = await writeDocumentationAfterGuard(path, content, guard);
    this.writes += 1;
    return promotedIdentity;
  };
}

class InterveningDuringPromotionAtomicWriter {
  private hasInjectedEdit = false;

  constructor(
    private readonly interveningPath: string,
    private readonly interveningContent: string,
  ) {}

  readonly write: DocumentationAtomicWriter = async (path, content, guard) => {
    if (!this.hasInjectedEdit) {
      this.hasInjectedEdit = true;
      await writeFile(this.interveningPath, this.interveningContent);
    }
    return await writeDocumentationAfterGuard(path, content, guard);
  };
}

class RetargetingDocumentationFileOpener {
  private hasRetargeted = false;

  constructor(
    private readonly shouldRetarget: (path: string) => boolean,
    private readonly replacementPath: string,
    private readonly replacementContent: string,
  ) {}

  readonly open: DocumentationFileOpener = async (path) => {
    const handle = await open(path, constants.O_RDONLY);
    return {
      stat: async () => await handle.stat(),
      readText: async () => {
        if (!this.hasRetargeted && this.shouldRetarget(path)) {
          this.hasRetargeted = true;
          await replaceDocumentationPathIdentity(
            path,
            this.replacementPath,
            this.replacementContent,
          );
        }
        return (await handle.readFile()).toString();
      },
      close: async () => await handle.close(),
    };
  };
}

class RetargetingDocumentationCanonicalPathResolver {
  private hasRetargeted = false;

  constructor(
    private readonly targetPath: string,
    private readonly replacementPath: string,
    private readonly replacementContent: string,
  ) {}

  readonly resolve: DocumentationCanonicalPathResolver = async (path) => {
    if (!this.hasRetargeted && path === this.targetPath) {
      this.hasRetargeted = true;
      await replaceDocumentationPathIdentity(
        path,
        this.replacementPath,
        this.replacementContent,
      );
    }
    return await realpath(path);
  };
}

class TrackingDocumentationFileOpener {
  openHandleCount = 0;

  readonly open: DocumentationFileOpener = async (path) => {
    const handle = await open(path, constants.O_RDONLY);
    this.openHandleCount += 1;
    let isClosed = false;
    return {
      stat: async () => await handle.stat(),
      readText: async () => (await handle.readFile()).toString(),
      close: async () => {
        if (isClosed) return;
        await handle.close();
        isClosed = true;
        this.openHandleCount -= 1;
      },
    };
  };
}

class IdentityReplacingDocumentationAtomicWriter {
  writes = 0;

  constructor(
    private readonly targetPath: string,
    private readonly replacementPath: string,
    private readonly replacementContent: string,
  ) {}

  readonly write: DocumentationAtomicWriter = async (path, content, guard) => {
    if (path === this.targetPath) {
      await replaceDocumentationPathIdentity(
        path,
        this.replacementPath,
        this.replacementContent,
      );
    }
    const promotedIdentity = await writeDocumentationAfterGuard(path, content, guard);
    this.writes += 1;
    return promotedIdentity;
  };
}

class PostPromotionEditFailingAtomicWriter {
  successfulWrites = 0;
  failures = 0;

  constructor(
    private readonly promotedPath: string,
    private readonly interveningContent: string,
  ) {}

  readonly write: DocumentationAtomicWriter = async (path, content, guard) => {
    if (this.successfulWrites === 1 && this.failures === 0) {
      await guard();
      await writeFile(this.promotedPath, this.interveningContent);
      this.failures += 1;
      throw new Error("Documentation promotion failed after an intervening edit");
    }
    const promotedIdentity = await writeDocumentationAfterGuard(path, content, guard);
    this.successfulWrites += 1;
    return promotedIdentity;
  };
}

class PostRenameIdentityReplacingAtomicFileSystem implements AtomicWriteFileSystem {
  successfulRenames = 0;
  failures = 0;

  constructor(
    private readonly replacementPath: string,
    private readonly promotedContent: string,
  ) {}

  readonly writeFile = async (path: string, content: string): Promise<void> => {
    await writeFile(path, content);
  };

  readonly rename = async (from: string, to: string): Promise<void> => {
    if (this.successfulRenames === 1 && this.failures === 0) {
      this.failures += 1;
      throw new Error("Documentation promotion failed after an identity replacement");
    }
    await rename(from, to);
    await replaceDocumentationPathIdentity(to, this.replacementPath, this.promotedContent);
    this.successfulRenames += 1;
  };

  readonly rm = async (path: string, options: { readonly force: true }): Promise<void> => {
    await rm(path, options);
  };
}

async function writeDocumentationAfterGuard(
  path: string,
  content: string,
  guard: DocumentationReplacementGuard,
): Promise<DocumentationFileIdentity> {
  await guard();
  await writeFile(path, content);
  const stats = await lstat(path);
  return { device: stats.dev, inode: stats.ino };
}

class InterveningDocumentationEditPromoter {
  constructor(
    private readonly productDir: string,
    private readonly sourcePath: string,
    private readonly content: string,
    private readonly delegate: DocumentationPromoter,
  ) {}

  readonly promote: DocumentationPromoter = async (documents) => {
    await writeFile(join(this.productDir, this.sourcePath), this.content);
    await this.delegate(documents);
  };
}

class InterveningDocumentationIdentityPromoter {
  constructor(
    private readonly targetPath: string,
    private readonly replacementPath: string,
    private readonly content: string,
    private readonly delegate: DocumentationPromoter,
  ) {}

  readonly promote: DocumentationPromoter = async (documents) => {
    await replaceDocumentationPathIdentity(this.targetPath, this.replacementPath, this.content);
    await this.delegate(documents);
  };
}

interface DocumentationFailureControls {
  readonly agentRunner?: AgentRunner;
  readonly readDocument?: StagedDocumentationReader;
}

type ProductDocumentationReader = (path: string) => Promise<string>;

type DocumentationReadRaceTarget = typeof DOCUMENTATION_READ_RACE_TARGET[keyof typeof DOCUMENTATION_READ_RACE_TARGET];

interface PrimaryDocumentation {
  readonly path: string;
  readonly originalContent: string;
  readonly updatedContent: string;
  readonly interveningContent: string;
}

class RecordingDocumentationAuditor implements AgentAuditor {
  readonly requests: AgentAuditRequest[] = [];

  async audit(request: AgentAuditRequest): Promise<string> {
    this.requests.push(request);
    return DOCUMENTATION_SYNC_AUDIT_APPROVED;
  }
}

async function withDocumentationScenario(
  scenario: DocumentationSyncScenario,
  run: (
    options: ComposeDocumentationSyncOptions,
    readProductDocument: ProductDocumentationReader,
    agent: DocumentationWritingAgent,
  ) => Promise<void>,
): Promise<void> {
  await withTempDir(PRODUCT_DIRECTORY_PREFIX, async (productDir) => {
    for (const [path, content] of Object.entries(scenario.original)) {
      if (content === undefined) throw new Error(`No original documentation for ${path}`);
      const absolutePath = join(productDir, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
    }
    for (const { path, content } of scenario.ambientState) {
      const absolutePath = join(productDir, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
    }
    await materializeDocumentationConfig(productDir, scenario.config);
    const agent = new DocumentationWritingAgent(scenario.updated);
    const filesystem = createDocumentationSyncFilesystem();
    await run(
      {
        releaseData: scenario.releaseData,
        config: scenario.config,
        productDir,
        agentRunner: agent,
        stageDocumentation: filesystem.stageDocumentation,
        readDocument: filesystem.readDocument,
        promoteDocumentation: filesystem.promoteDocumentation,
        faithfulnessAuditor: approvingDocumentationAuditor,
      },
      (path) => readFile(join(productDir, path), "utf8"),
      agent,
    );
  });
}

const approvingDocumentationAuditor: DocumentationFaithfulnessAuditor = async () => {};

const rejectingDocumentationAuditor: DocumentationFaithfulnessAuditor = async () => {
  throw new Error(REJECTING_DOCUMENTATION_AUDIT_MESSAGE);
};

const REJECTING_DOCUMENTATION_AUDIT_MESSAGE = "Documentation faithfulness rejected";

const failingDocumentationReader: StagedDocumentationReader = async () => {
  throw new Error("Documentation read-back failed");
};

async function materializeDocumentationConfig(
  productDir: string,
  config: DocumentationSyncScenario["config"],
): Promise<void> {
  if (config.paths === undefined) return;
  await writeFile(
    join(productDir, DEFAULT_CONFIG_FILENAME),
    serializeConfigFileSections(CONFIG_FILE_FORMAT.YAML, {
      [RELEASE_SECTION]: {
        [RELEASE_CONFIG_FIELDS.DOCUMENTATION]: {
          [RELEASE_CONFIG_FIELDS.PATHS]: config.paths,
        },
      },
    }).value,
  );
}

function parseDocumentationSyncPromptInput(prompt: string): {
  readonly releaseData: DocumentationSyncScenario["releaseData"];
  readonly documents: readonly { readonly sourcePath: string; readonly stagedPath: string }[];
} {
  const blockStart = prompt.indexOf(DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN);
  const blockEnd = prompt.indexOf(DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE);
  if (
    !prompt.startsWith(DOCUMENTATION_SYNC_PROMPT_INSTRUCTION)
    || blockStart < 0
    || blockEnd <= blockStart
    || blockEnd + DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE.length !== prompt.length
  ) {
    throw new Error("Documentation sync prompt does not match its source-owned envelope");
  }
  return parseDocumentationPromptDataBlock(prompt) as {
    readonly releaseData: DocumentationSyncScenario["releaseData"];
    readonly documents: readonly { readonly sourcePath: string; readonly stagedPath: string }[];
  };
}

function documentationSyncPromptInstruction(prompt: string): string {
  const blockStart = prompt.indexOf(DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN);
  if (blockStart < 0) {
    throw new Error("Documentation sync prompt has no data block");
  }
  return prompt.slice(0, blockStart);
}

async function writeGeneratedDocumentation(
  updated: DocumentationSyncScenario["updated"],
  documents: readonly { readonly sourcePath: string; readonly stagedPath: string }[],
): Promise<void> {
  for (const path of documents) {
    const content = updated[path.sourcePath];
    if (content === undefined) throw new Error(`No generated documentation update for ${path.sourcePath}`);
    await writeFile(path.stagedPath, content);
  }
}

async function writeFirstReleasedVersionReference(
  releaseData: ReleaseData,
  documents: readonly { readonly sourcePath: string; readonly stagedPath: string }[],
): Promise<void> {
  if (releaseData.previousTag === null) {
    throw new Error("Partial release-version replacement requires a previous release tag");
  }
  const previousVersion = releaseVersionFromTag(releaseData.previousTag);
  for (const path of documents) {
    const content = await readFile(path.stagedPath, "utf8");
    await writeFile(
      path.stagedPath,
      content.replace(previousVersion, releaseData.version),
    );
  }
}

async function replaceDocumentationPathIdentity(
  targetPath: string,
  replacementPath: string,
  replacementContent: string,
): Promise<void> {
  await mkdir(dirname(replacementPath), { recursive: true });
  await writeFile(replacementPath, replacementContent);
  await rename(replacementPath, targetPath);
}

function composeWithDocumentationFilesystem(
  options: ComposeDocumentationSyncOptions,
  filesystem: DocumentationSyncFilesystem,
): Promise<{ readonly paths: readonly string[] }> {
  return composeDocumentationSync({
    ...options,
    stageDocumentation: filesystem.stageDocumentation,
    readDocument: filesystem.readDocument,
    promoteDocumentation: filesystem.promoteDocumentation,
  });
}

function primaryDocumentation(scenario: DocumentationSyncScenario): PrimaryDocumentation {
  const path = scenario.paths.at(0);
  if (path === undefined) throw new Error("Generated documentation set is empty");
  const originalContent = scenario.original[path];
  const updatedContent = scenario.updated[path];
  const interveningContent = scenario.intervening[path];
  if (originalContent === undefined || updatedContent === undefined || interveningContent === undefined) {
    throw new Error(`Generated primary documentation is incomplete: ${path}`);
  }
  return { path, originalContent, updatedContent, interveningContent };
}

function lastDocumentationPath(scenario: DocumentationSyncScenario): string {
  const path = scenario.paths.at(-1);
  if (path === undefined) throw new Error("Generated documentation set has no last path");
  return path;
}

interface DocumentationContentObservation {
  readonly scenario: DocumentationSyncScenario;
  readonly actual: readonly { readonly path: string; readonly content: string }[];
}

interface VersionlessDocumentationSyncObservation extends DocumentationContentObservation {
  readonly producerInstruction: string;
  readonly encodedVersion: string;
  readonly permissionMode: AgentRunRequest["permissionMode"];
  readonly auditRequestCount: number;
  readonly auditInstruction: string;
}

async function observeDefaultDocumentationSync(): Promise<DocumentationContentObservation> {
  return await observeDocumentationSync(
    sampleReleaseTestValue(arbitraryDefaultDocumentationSyncScenario()),
  );
}

async function observeConfiguredDocumentationSync(): Promise<DocumentationContentObservation> {
  return await observeDocumentationSync(
    sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
  );
}

async function observeFirstReleaseDocumentationSync(): Promise<DocumentationContentObservation> {
  return await observeDocumentationSync(
    sampleReleaseTestValue(arbitraryFirstReleaseDocumentationSyncScenario()),
  );
}

async function observeVersionlessSubsequentReleaseDocumentationSync(): Promise<
  VersionlessDocumentationSyncObservation
> {
  const scenario = sampleReleaseTestValue(arbitraryVersionlessSubsequentReleaseDocumentationSyncScenario());
  const auditor = new RecordingDocumentationAuditor();
  let observation: VersionlessDocumentationSyncObservation | undefined;
  await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
    await runDocumentationSyncCli({
      ...options,
      faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
    });
    const producerRequest = requiredAgentRequest(agent.requests, "producer");
    const auditRequest = requiredAgentRequest(auditor.requests, "audit");
    observation = {
      ...await observeDocumentationContent(scenario, readProductDocument),
      producerInstruction: documentationSyncPromptInstruction(producerRequest.prompt),
      encodedVersion: JSON.stringify(scenario.releaseData.version),
      permissionMode: producerRequest.permissionMode,
      auditRequestCount: auditor.requests.length,
      auditInstruction: documentationSyncPromptInstruction(auditRequest.prompt),
    };
  });
  if (observation === undefined) {
    throw new Error("Versionless documentation sync produced no observation");
  }
  return observation;
}

async function observeDocumentationSync(
  scenario: DocumentationSyncScenario,
): Promise<DocumentationContentObservation> {
  let observation: DocumentationContentObservation | undefined;
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    await runDocumentationSyncCli(options);
    observation = await observeDocumentationContent(scenario, readProductDocument);
  });
  if (observation === undefined) {
    throw new Error("Documentation sync produced no content observation");
  }
  return observation;
}

async function observeDocumentationContent(
  scenario: DocumentationSyncScenario,
  readProductDocument: ProductDocumentationReader,
): Promise<DocumentationContentObservation> {
  return {
    scenario,
    actual: await Promise.all(
      scenario.paths.map(async (path) => ({ path, content: await readProductDocument(path) })),
    ),
  };
}

function requiredAgentRequest<T extends AgentRunRequest | AgentAuditRequest>(
  requests: readonly T[],
  boundary: string,
): T {
  const request = requests.at(0);
  if (request === undefined) {
    throw new Error(`Documentation sync ${boundary} emitted no request`);
  }
  return request;
}

interface DocumentationPathMappingObservation {
  readonly mappingCase: DocumentationPathMappingCase;
  readonly actual: readonly string[];
}

interface DocumentationPathSemanticsObservation {
  readonly actual: string | undefined;
  readonly productDir: string;
  readonly sourcePath: string;
  readonly resolve: (path: string, ...paths: string[]) => string;
}

interface DocumentationPathAliasObservation {
  readonly aliasCase: DocumentationPathAliasCase;
  readonly canonicalTargetPath: string;
  readonly stageWorkingDirectory: string;
  readonly actualDocumentCount: number;
  readonly actualSourcePath: string;
  readonly actualTargetPath: string;
  readonly actualStagedPath: string;
  readonly actualContent: string;
}

interface DocumentationConfigObservation {
  readonly scenario: DocumentationSyncScenario;
  readonly actual: Awaited<
    ReturnType<typeof DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES.resolveDocumentationConfig>
  >;
}

async function observeDocumentationPathMappings(): Promise<readonly DocumentationPathMappingObservation[]> {
  const observations: DocumentationPathMappingObservation[] = [];
  for (const mappingCase of documentationPathMappingCases()) {
    const { scenario } = mappingCase;
    await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
      await runDocumentationSyncCli(options);
      observations.push({
        mappingCase,
        actual: parseDocumentationSyncPromptInput(requiredAgentRequest(agent.requests, "producer").prompt)
          .documents.map(({ sourcePath }) => sourcePath),
      });
    });
  }
  return observations;
}

function observeDocumentationPathSemantics(): readonly DocumentationPathSemanticsObservation[] {
  return DOCUMENTATION_PATH_SEMANTICS.map(({ join: joinPath, operations }) => {
    const scenario = sampleReleaseTestValue(arbitraryNestedDocumentationSyncScenario());
    const sourcePath = scenario.paths.at(0);
    if (sourcePath === undefined) {
      throw new Error("Generated nested documentation scenario has no source path");
    }
    const productDir = joinPath(operations.sep, PRODUCT_DIRECTORY_PREFIX);
    return {
      actual: resolveCanonicalDocumentationTarget(productDir, sourcePath, operations),
      productDir,
      sourcePath,
      resolve: operations.resolve,
    };
  });
}

async function observeDocumentationPathAliases(): Promise<readonly DocumentationPathAliasObservation[]> {
  const observations: DocumentationPathAliasObservation[] = [];
  for (const aliasCase of sampleReleaseTestValue(arbitraryDocumentationPathAliasCases())) {
    await withTempDir(PRODUCT_DIRECTORY_PREFIX, async (productDir) => {
      const canonicalPath = join(productDir, aliasCase.canonicalPath);
      await mkdir(dirname(canonicalPath), { recursive: true });
      await writeFile(canonicalPath, aliasCase.content);
      const filesystem = createDocumentationSyncFilesystem();
      const stage = await filesystem.stageDocumentation(productDir, [aliasCase.configuredPath]);
      try {
        const document = stage.documents.at(0);
        if (document === undefined) {
          throw new Error("Documentation alias staging produced no document");
        }
        observations.push({
          aliasCase,
          canonicalTargetPath: await realpath(canonicalPath),
          stageWorkingDirectory: stage.workingDirectory,
          actualDocumentCount: stage.documents.length,
          actualSourcePath: document.sourcePath,
          actualTargetPath: document.targetPath,
          actualStagedPath: document.stagedPath,
          actualContent: await filesystem.readDocument(stage.workingDirectory, document.stagedPath),
        });
      } finally {
        await stage.cleanup();
      }
    });
  }
  return observations;
}

async function observeIndependentDocumentationConfigResolution(): Promise<DocumentationConfigObservation> {
  const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
  return await withTempDir(PRODUCT_DIRECTORY_PREFIX, async (productDir) => {
    await writeFile(
      join(productDir, DEFAULT_CONFIG_FILENAME),
      serializeConfigFileSections(CONFIG_FILE_FORMAT.YAML, {
        [RELEASE_SECTION]: {
          [RELEASE_CONFIG_FIELDS.DOCUMENTATION]: {
            [RELEASE_CONFIG_FIELDS.PATHS]: scenario.paths,
          },
        },
        [DIAGNOSE_SECTION]: sampleReleaseTestValue(arbitraryDomainLiteral()),
      }).value,
    );
    return {
      scenario,
      actual: await DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES.resolveDocumentationConfig(productDir),
    };
  });
}

interface DocumentationPathSetObservation {
  readonly scenario: DocumentationSyncScenario;
  readonly actual: readonly string[];
}

type DocumentationVersionPreservationObservation = DocumentationContentObservation;

interface DocumentationUnrelatedVersionRewriteObservation extends DocumentationContentObservation {
  readonly testCase: DocumentationUnrelatedVersionRewriteScenario;
  readonly error: unknown;
  readonly actualAuditDocuments: readonly { readonly path: string; readonly updatedContent: string }[];
  readonly promotionCallCount: number;
}

interface DocumentationAgentFileToolBoundaryObservation {
  readonly promptPaths: readonly string[];
  readonly workingDirectory: string;
  readonly requestTools: readonly string[];
  readonly requestAllowedTools: readonly string[];
  readonly optionPermissionMode: string | undefined;
  readonly optionAllowedTools: readonly string[];
  readonly tool: string;
  readonly containedHookResult: unknown;
  readonly escapedHookResults: readonly unknown[];
}

async function observeConfiguredDocumentationPathSet(
  scenario: DocumentationSyncScenario,
): Promise<DocumentationPathSetObservation> {
  let observation: DocumentationPathSetObservation | undefined;
  await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
    await runDocumentationSyncCli(options);
    observation = {
      scenario,
      actual: parseDocumentationSyncPromptInput(requiredAgentRequest(agent.requests, "producer").prompt)
        .documents.map(({ sourcePath }) => sourcePath),
    };
  });
  if (observation === undefined) throw new Error("Documentation path-set property produced no observation");
  return observation;
}

async function observeDocumentationVersionPreservation(
  scenarios: DocumentationVersionPreservationScenarios,
): Promise<readonly DocumentationVersionPreservationObservation[]> {
  return await Promise.all(
    [scenarios.withPreviousTag, scenarios.withoutPreviousTag].map(async (scenario) =>
      await observeDocumentationSync(scenario)
    ),
  );
}

async function observeUnrelatedVersionRewrite(
  testCase: DocumentationUnrelatedVersionRewriteScenario,
): Promise<DocumentationUnrelatedVersionRewriteObservation> {
  const promoter = new RecordingDocumentationPromoter();
  let observation: DocumentationUnrelatedVersionRewriteObservation | undefined;
  await withDocumentationScenario(testCase.scenario, async (options, readProductDocument) => {
    let actualAuditDocuments: readonly { readonly path: string; readonly updatedContent: string }[] = [];
    let error: unknown;
    try {
      await composeDocumentationSync({
        ...options,
        agentRunner: new DocumentationWritingAgent(testCase.rewritten),
        faithfulnessAuditor: async (request) => {
          actualAuditDocuments = request.documents.map(({ path, updatedContent }) => ({ path, updatedContent }));
          await rejectingDocumentationAuditor(request);
        },
        promoteDocumentation: promoter.promote,
      });
    } catch (caught) {
      error = caught;
    }
    const content = await observeDocumentationContent(testCase.scenario, readProductDocument);
    observation = {
      scenario: testCase.scenario,
      testCase,
      actual: content.actual,
      error,
      actualAuditDocuments,
      promotionCallCount: promoter.calls.length,
    };
  });
  if (observation === undefined) throw new Error("Unrelated version rewrite produced no observation");
  return observation;
}

async function observeDocumentationAgentFileToolBoundary(
  scenario: DocumentationAgentFileToolBoundaryScenario,
): Promise<DocumentationAgentFileToolBoundaryObservation> {
  const documentationScenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
  const agent = new DocumentationWritingAgent(documentationScenario.updated);
  let observation: DocumentationAgentFileToolBoundaryObservation | undefined;
  await withDocumentationScenario(documentationScenario, async (options) => {
    await composeDocumentationSync({ ...options, agentRunner: agent });
    const request = requiredAgentRequest(agent.requests, "producer");
    const agentOptions = createAgentRunOptions(request);
    const preToolUseHook = agentOptions.hooks?.PreToolUse?.at(0)?.hooks.at(0);
    if (preToolUseHook === undefined) {
      throw new Error("Agent run options do not enforce pre-tool-use containment");
    }
    const containedPath = join(request.workingDirectory, posix.basename(scenario.containedPath));
    const escapedPaths = [
      scenario.escapedPaths[0],
      join(dirname(request.workingDirectory), posix.basename(scenario.escapedPaths[1])),
    ];
    const hookOptions = { signal: new AbortController().signal };
    const invokeHook = async (path: string): Promise<unknown> =>
      await preToolUseHook(
        {
          hook_event_name: AGENT_PRE_TOOL_USE_HOOK_EVENT,
          session_id: request.prompt,
          transcript_path: path,
          cwd: request.workingDirectory,
          tool_name: scenario.tool,
          tool_input: { [AGENT_FILE_TOOL_PATH_INPUT_FIELD]: path },
          tool_use_id: path,
        },
        path,
        hookOptions,
      );
    observation = {
      promptPaths: parseDocumentationSyncPromptInput(request.prompt).documents.map(({ stagedPath }) => stagedPath),
      workingDirectory: request.workingDirectory,
      requestTools: request.tools,
      requestAllowedTools: request.allowedTools,
      optionPermissionMode: agentOptions.permissionMode,
      optionAllowedTools: agentOptions.allowedTools ?? [],
      tool: scenario.tool,
      containedHookResult: await invokeHook(containedPath),
      escapedHookResults: await Promise.all(escapedPaths.map(invokeHook)),
    };
  });
  if (observation === undefined) throw new Error("Agent file-tool boundary produced no observation");
  return observation;
}

const DOCUMENTATION_FAILURE_CASE = {
  GENERATION: "generation",
  READ_BACK: "read-back",
  INCOMPLETE_SET: "incomplete-set",
} as const;

type DocumentationFailureCase = (typeof DOCUMENTATION_FAILURE_CASE)[keyof typeof DOCUMENTATION_FAILURE_CASE];

const DOCUMENTATION_VERSION_VALIDATION_CASE = {
  COMPLETE_HISTORY: "complete-history",
  VERSION_VARIANT: "version-variant",
  PARTIAL_REWRITE: "partial-rewrite",
} as const;

type DocumentationVersionValidationCase =
  (typeof DOCUMENTATION_VERSION_VALIDATION_CASE)[keyof typeof DOCUMENTATION_VERSION_VALIDATION_CASE];

const DOCUMENTATION_IDENTITY_CASE = {
  STAGED_SYMLINK: "staged-symlink",
  PRODUCT_READ: "product-read",
  CANONICAL_RESOLUTION: "canonical-resolution",
  STAGED_READ: "staged-read",
  DUPLICATE_FILE: "duplicate-file",
  STAGED_REPLACEMENT: "staged-replacement",
  PROMOTION_REPLACEMENT: "promotion-replacement",
} as const;

type DocumentationIdentityCase = (typeof DOCUMENTATION_IDENTITY_CASE)[keyof typeof DOCUMENTATION_IDENTITY_CASE];

const DOCUMENTATION_ROLLBACK_CASE = {
  POST_PROMOTION_EDIT: "post-promotion-edit",
  IDENTITY_REPLACEMENT: "identity-replacement",
} as const;

type DocumentationRollbackCase = (typeof DOCUMENTATION_ROLLBACK_CASE)[keyof typeof DOCUMENTATION_ROLLBACK_CASE];

const DOCUMENTATION_PROMOTION_FAILURE_CASE = {
  SECOND_WRITE: "second-write",
  POST_STAGING_EDIT: "post-staging-edit",
  DURING_PROMOTION_EDIT: "during-promotion-edit",
} as const;

type DocumentationPromotionFailureCase =
  (typeof DOCUMENTATION_PROMOTION_FAILURE_CASE)[keyof typeof DOCUMENTATION_PROMOTION_FAILURE_CASE];

const DOCUMENTATION_AUDIT_CASE = {
  REJECT_BEFORE_PROMOTION: "reject-before-promotion",
  TRANSFORMATION: "transformation",
} as const;

type DocumentationAuditCase = (typeof DOCUMENTATION_AUDIT_CASE)[keyof typeof DOCUMENTATION_AUDIT_CASE];

const DOCUMENTATION_PROMPT_CASE = {
  PRODUCER_INPUT: "producer-input",
  DATA_BOUNDARY: "data-boundary",
  AMBIENT_EXCLUSION: "ambient-exclusion",
} as const;

type DocumentationPromptCase = (typeof DOCUMENTATION_PROMPT_CASE)[keyof typeof DOCUMENTATION_PROMPT_CASE];

interface DocumentationRejectionObservation extends DocumentationContentObservation {
  readonly error: unknown;
  readonly agentRequestCount: number;
  readonly auditRequestCount: number;
  readonly promotionCallCount: number;
  readonly atomicWriteCount: number;
}

interface DocumentationPathFailureObservation {
  readonly failureCase: DocumentationPathFailureCase;
  readonly error: unknown;
  readonly agentRequestCount: number;
  readonly promotionCallCount: number;
  readonly backingFileContents: readonly string[];
}

interface DocumentationFifoObservation {
  readonly outcome: (typeof DOCUMENTATION_FIFO_STAGE_OUTCOME)[keyof typeof DOCUMENTATION_FIFO_STAGE_OUTCOME];
  readonly agentRequestCount: number;
  readonly promotionCallCount: number;
}

interface DocumentationAtomicPromotionObservation extends DocumentationContentObservation {
  readonly error: unknown;
  readonly result: { readonly paths: readonly string[] } | undefined;
  readonly openHandleCount: number;
}

interface DocumentationRollbackObservation extends DocumentationContentObservation {
  readonly primary: PrimaryDocumentation;
  readonly rollbackCase: DocumentationRollbackCase;
  readonly error: unknown;
  readonly failureCount: number;
}

interface DocumentationPromotionFailureObservation extends DocumentationContentObservation {
  readonly failureCase: DocumentationPromotionFailureCase;
  readonly interveningPath: string | undefined;
  readonly error: unknown;
  readonly atomicWriteCount: number;
  readonly atomicFailureCount: number;
}

interface DocumentationAuditObservation extends DocumentationContentObservation {
  readonly auditCase: DocumentationAuditCase;
  readonly error: unknown;
  readonly actualReleaseData: ReleaseData | undefined;
  readonly actualDocuments: readonly unknown[];
  readonly promotionCallCount: number;
}

interface DocumentationPromptObservation {
  readonly scenario: DocumentationSyncScenario;
  readonly producerWorkingDirectory: string;
  readonly producerRequestCount: number;
  readonly actualProducerInput: unknown;
  readonly producerInstruction: string;
  readonly encodedVersion: string;
  readonly auditRequestCount: number;
  readonly actualAuditInput: unknown;
  readonly auditInstruction: string;
  readonly producerPrompt: string;
}

async function observeDocumentationPathFailures(): Promise<readonly DocumentationPathFailureObservation[]> {
  return await Promise.all(
    documentationPathFailureCases().map(async (failureCase) =>
      await withTempDir(
        PRODUCT_DIRECTORY_PREFIX,
        async (productDir) =>
          await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
            await materializeDocumentationPathFailure(failureCase, productDir, externalDir);
            const filesystem = createDocumentationSyncFilesystem();
            const agent = new PassiveDocumentationAgent();
            const promoter = new RecordingDocumentationPromoter();
            let error: unknown;
            try {
              await composeDocumentationSync({
                releaseData: failureCase.releaseData,
                config: failureCase.config,
                productDir,
                agentRunner: agent,
                stageDocumentation: filesystem.stageDocumentation,
                readDocument: filesystem.readDocument,
                promoteDocumentation: promoter.promote,
                faithfulnessAuditor: approvingDocumentationAuditor,
              });
            } catch (caught) {
              error = caught;
            }
            const backingFileContents: string[] = [];
            if (failureCase.kind === DOCUMENTATION_PATH_FAILURE_KIND.CANONICAL_ESCAPE) {
              backingFileContents.push(
                await readFile(join(externalDir, failureCase.backingPath), DOCUMENTATION_TEXT_ENCODING),
              );
            }
            if (failureCase.kind === DOCUMENTATION_PATH_FAILURE_KIND.FINAL_SYMLINK) {
              backingFileContents.push(
                await readFile(join(productDir, failureCase.backingPath), DOCUMENTATION_TEXT_ENCODING),
              );
            }
            return {
              failureCase,
              error,
              agentRequestCount: agent.requests.length,
              promotionCallCount: promoter.calls.length,
              backingFileContents,
            };
          }),
      )
    ),
  );
}

async function observeDocumentationFailure(
  failureCase: DocumentationFailureCase,
): Promise<DocumentationRejectionObservation> {
  const scenario = sampleReleaseTestValue(
    failureCase === DOCUMENTATION_FAILURE_CASE.INCOMPLETE_SET
      ? arbitraryMultiDocumentSyncScenario()
      : arbitraryConfiguredDocumentationSyncScenario(),
  );
  const promoter = new RecordingDocumentationPromoter();
  const agent = failureCase === DOCUMENTATION_FAILURE_CASE.GENERATION
    ? new FailingDocumentationAgent()
    : failureCase === DOCUMENTATION_FAILURE_CASE.INCOMPLETE_SET
    ? new FirstDocumentationWritingAgent(scenario.updated)
    : new PassiveDocumentationAgent();
  let observation: DocumentationRejectionObservation | undefined;
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    const auditor = new RecordingDocumentationAuditor();
    let error: unknown;
    try {
      await composeDocumentationSync({
        ...options,
        agentRunner: agent,
        readDocument: failureCase === DOCUMENTATION_FAILURE_CASE.READ_BACK
          ? failingDocumentationReader
          : options.readDocument,
        faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
        promoteDocumentation: promoter.promote,
      });
    } catch (caught) {
      error = caught;
    }
    observation = {
      ...await observeDocumentationContent(scenario, readProductDocument),
      error,
      agentRequestCount: agent.requests.length,
      auditRequestCount: auditor.requests.length,
      promotionCallCount: promoter.calls.length,
      atomicWriteCount: 0,
    };
  });
  if (observation === undefined) throw new Error("Documentation failure case produced no observation");
  return observation;
}

async function observeDocumentationVersionValidation(
  validationCase: DocumentationVersionValidationCase,
): Promise<DocumentationRejectionObservation> {
  const scenario = sampleReleaseTestValue(
    validationCase === DOCUMENTATION_VERSION_VALIDATION_CASE.VERSION_VARIANT
      ? arbitraryReleaseVersionVariantOnlyScenario()
      : arbitraryConfiguredDocumentationSyncScenario(),
  );
  const agent = validationCase === DOCUMENTATION_VERSION_VALIDATION_CASE.VERSION_VARIANT
    ? new DocumentationWritingAgent(scenario.updated)
    : validationCase === DOCUMENTATION_VERSION_VALIDATION_CASE.PARTIAL_REWRITE
    ? new PartiallyUpdatingDocumentationAgent()
    : new PassiveDocumentationAgent();
  const auditor = new RecordingDocumentationAuditor();
  const promoter = new RecordingDocumentationPromoter();
  let observation: DocumentationRejectionObservation | undefined;
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    let error: unknown;
    try {
      await composeDocumentationSync({
        ...options,
        agentRunner: agent,
        faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
        promoteDocumentation: promoter.promote,
      });
    } catch (caught) {
      error = caught;
    }
    observation = {
      ...await observeDocumentationContent(scenario, readProductDocument),
      error,
      agentRequestCount: agent.requests.length,
      auditRequestCount: auditor.requests.length,
      promotionCallCount: promoter.calls.length,
      atomicWriteCount: 0,
    };
  });
  if (observation === undefined) throw new Error("Documentation version validation produced no observation");
  return observation;
}

async function observeDocumentationIdentityRejection(
  identityCase: DocumentationIdentityCase,
): Promise<DocumentationRejectionObservation> {
  const scenario = sampleReleaseTestValue(
    identityCase === DOCUMENTATION_IDENTITY_CASE.DUPLICATE_FILE
      || identityCase === DOCUMENTATION_IDENTITY_CASE.STAGED_REPLACEMENT
      ? arbitraryMultiDocumentSyncScenario()
      : arbitrarySingleDocumentSyncScenario(),
  );
  return await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    let observation: DocumentationRejectionObservation | undefined;
    await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
      const primary = primaryDocumentation(scenario);
      const auditor = new RecordingDocumentationAuditor();
      const promoter = new RecordingDocumentationPromoter();
      let atomicWriteCount = 0;
      let error: unknown;
      switch (identityCase) {
        case DOCUMENTATION_IDENTITY_CASE.STAGED_SYMLINK:
          error = await captureError(async () =>
            await composeDocumentationSync({
              ...options,
              agentRunner: new StagedSymlinkReplacingAgent(
                scenario.updated,
                primary.path,
                join(externalDir, primary.path),
              ),
              faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
              promoteDocumentation: promoter.promote,
            })
          );
          break;
        case DOCUMENTATION_IDENTITY_CASE.PRODUCT_READ:
        case DOCUMENTATION_IDENTITY_CASE.STAGED_READ: {
          const target = identityCase === DOCUMENTATION_IDENTITY_CASE.PRODUCT_READ
            ? DOCUMENTATION_READ_RACE_TARGET.PRODUCT
            : DOCUMENTATION_READ_RACE_TARGET.STAGED;
          const canonicalProductDir = await realpath(options.productDir);
          const opener = new RetargetingDocumentationFileOpener(
            target === DOCUMENTATION_READ_RACE_TARGET.PRODUCT
              ? (path) => path === join(canonicalProductDir, primary.path)
              : (path) => !isPathContained(canonicalProductDir, path),
            join(externalDir, primary.path),
            target === DOCUMENTATION_READ_RACE_TARGET.PRODUCT
              ? primary.originalContent
              : primary.updatedContent,
          );
          const writer = new RecordingDocumentationAtomicWriter();
          const filesystem = createDocumentationSyncFilesystem({
            openDocumentationFile: opener.open,
            writeDocumentAtomic: writer.write,
          });
          error = await captureError(async () => await composeWithDocumentationFilesystem(options, filesystem));
          atomicWriteCount = writer.writes;
          break;
        }
        case DOCUMENTATION_IDENTITY_CASE.CANONICAL_RESOLUTION: {
          const canonicalProductDir = await realpath(options.productDir);
          const resolver = new RetargetingDocumentationCanonicalPathResolver(
            join(canonicalProductDir, primary.path),
            join(externalDir, primary.path),
            primary.originalContent,
          );
          const writer = new RecordingDocumentationAtomicWriter();
          const filesystem = createDocumentationSyncFilesystem({
            resolveCanonicalDocumentationPath: resolver.resolve,
            writeDocumentAtomic: writer.write,
          });
          error = await captureError(async () => await composeWithDocumentationFilesystem(options, filesystem));
          atomicWriteCount = writer.writes;
          break;
        }
        case DOCUMENTATION_IDENTITY_CASE.DUPLICATE_FILE: {
          const aliasPath = scenario.paths.at(1);
          if (aliasPath === undefined) throw new Error("Generated documentation identity case requires two paths");
          await rm(join(options.productDir, aliasPath));
          await link(join(options.productDir, primary.path), join(options.productDir, aliasPath));
          error = await captureError(async () =>
            await composeDocumentationSync({ ...options, promoteDocumentation: promoter.promote })
          );
          break;
        }
        case DOCUMENTATION_IDENTITY_CASE.STAGED_REPLACEMENT: {
          const writer = new RecordingDocumentationAtomicWriter();
          const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
          const identityPromoter = new InterveningDocumentationIdentityPromoter(
            join(options.productDir, primary.path),
            join(externalDir, primary.path),
            primary.originalContent,
            filesystem.promoteDocumentation,
          );
          error = await captureError(async () =>
            await composeDocumentationSync({ ...options, promoteDocumentation: identityPromoter.promote })
          );
          atomicWriteCount = writer.writes;
          break;
        }
        case DOCUMENTATION_IDENTITY_CASE.PROMOTION_REPLACEMENT: {
          const canonicalProductDir = await realpath(options.productDir);
          const writer = new IdentityReplacingDocumentationAtomicWriter(
            join(canonicalProductDir, primary.path),
            join(externalDir, primary.path),
            primary.originalContent,
          );
          const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
          error = await captureError(async () => await composeWithDocumentationFilesystem(options, filesystem));
          atomicWriteCount = writer.writes;
          break;
        }
      }
      observation = {
        ...await observeDocumentationContent(scenario, readProductDocument),
        error,
        agentRequestCount: agent.requests.length,
        auditRequestCount: auditor.requests.length,
        promotionCallCount: promoter.calls.length,
        atomicWriteCount,
      };
    });
    if (observation === undefined) throw new Error("Documentation identity case produced no observation");
    return observation;
  });
}

async function observeDocumentationFifoRejection(): Promise<DocumentationFifoObservation> {
  const scenario = sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario());
  const primary = primaryDocumentation(scenario);
  const promoter = new RecordingDocumentationPromoter();
  let observation: DocumentationFifoObservation | undefined;
  await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
    const fifoPath = join(options.productDir, primary.path);
    await rm(fifoPath);
    await execa(DOCUMENTATION_FIFO_COMMAND, [fifoPath]);
    const sync = composeDocumentationSync({ ...options, promoteDocumentation: promoter.promote });
    const outcome = await Promise.race([
      sync.then(
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.RESOLVED,
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.REJECTED,
      ),
      delay(DOCUMENTATION_FIFO_BLOCK_DETECTION_MS).then(() => DOCUMENTATION_FIFO_STAGE_OUTCOME.BLOCKED),
    ]);
    if (outcome === DOCUMENTATION_FIFO_STAGE_OUTCOME.BLOCKED) {
      await Promise.allSettled([sync, writeFile(fifoPath, primary.originalContent)]);
    }
    observation = {
      outcome,
      agentRequestCount: agent.requests.length,
      promotionCallCount: promoter.calls.length,
    };
  });
  if (observation === undefined) throw new Error("Documentation FIFO case produced no observation");
  return observation;
}

async function observeAtomicDocumentationPromotion(): Promise<DocumentationAtomicPromotionObservation> {
  const scenario = sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario());
  const opener = new TrackingDocumentationFileOpener();
  const writer = createDocumentationAtomicWriter({
    writeFile: async (path, content) => await writeFile(path, content),
    rename: async (from, to) => {
      if (opener.openHandleCount > 0) {
        throw new Error("Atomic rename attempted with an open documentation handle");
      }
      await rename(from, to);
    },
    rm: async (path, options) => await rm(path, options),
  });
  const filesystem = createDocumentationSyncFilesystem({
    openDocumentationFile: opener.open,
    writeDocumentAtomic: writer,
  });
  let observation: DocumentationAtomicPromotionObservation | undefined;
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    let result: { readonly paths: readonly string[] } | undefined;
    let error: unknown;
    try {
      result = await composeWithDocumentationFilesystem(options, filesystem);
    } catch (caught) {
      error = caught;
    }
    observation = {
      ...await observeDocumentationContent(scenario, readProductDocument),
      error,
      result,
      openHandleCount: opener.openHandleCount,
    };
  });
  if (observation === undefined) throw new Error("Atomic documentation promotion produced no observation");
  return observation;
}

async function observeDocumentationRollback(
  rollbackCase: DocumentationRollbackCase,
): Promise<DocumentationRollbackObservation> {
  const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
  const primary = primaryDocumentation(scenario);
  return await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    let observation: DocumentationRollbackObservation | undefined;
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      let error: unknown;
      let failureCount: number;
      if (rollbackCase === DOCUMENTATION_ROLLBACK_CASE.POST_PROMOTION_EDIT) {
        const writer = new PostPromotionEditFailingAtomicWriter(
          join(options.productDir, primary.path),
          primary.interveningContent,
        );
        const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
        error = await captureError(async () => await composeWithDocumentationFilesystem(options, filesystem));
        failureCount = writer.failures;
      } else {
        const fileSystem = new PostRenameIdentityReplacingAtomicFileSystem(
          join(externalDir, primary.path),
          primary.updatedContent,
        );
        const filesystem = createDocumentationSyncFilesystem({
          writeDocumentAtomic: createDocumentationAtomicWriter(fileSystem),
        });
        error = await captureError(async () => await composeWithDocumentationFilesystem(options, filesystem));
        failureCount = fileSystem.failures;
      }
      observation = {
        scenario,
        actual: (await observeDocumentationContent(scenario, readProductDocument)).actual,
        primary,
        rollbackCase,
        error,
        failureCount,
      };
    });
    if (observation === undefined) throw new Error("Documentation rollback produced no observation");
    return observation;
  });
}

async function observeDocumentationPromotionFailure(
  failureCase: DocumentationPromotionFailureCase,
): Promise<DocumentationPromotionFailureObservation> {
  const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
  let observation: DocumentationPromotionFailureObservation | undefined;
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    let error: unknown;
    let atomicWriteCount = 0;
    let atomicFailureCount = 0;
    let interveningPath: string | undefined;
    if (failureCase === DOCUMENTATION_PROMOTION_FAILURE_CASE.SECOND_WRITE) {
      const writer = new FailingSecondDocumentationAtomicWriter();
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      error = await captureError(async () =>
        await composeDocumentationSync({ ...options, promoteDocumentation: filesystem.promoteDocumentation })
      );
      atomicWriteCount = writer.successfulWrites;
      atomicFailureCount = writer.failures;
    } else {
      interveningPath = failureCase === DOCUMENTATION_PROMOTION_FAILURE_CASE.POST_STAGING_EDIT
        ? lastDocumentationPath(scenario)
        : scenario.paths.at(1);
      if (interveningPath === undefined) throw new Error("Generated promotion failure has no intervening path");
      const interveningContent = scenario.intervening[interveningPath];
      if (interveningContent === undefined) {
        throw new Error(`Generated promotion failure has no intervening content for ${interveningPath}`);
      }
      if (failureCase === DOCUMENTATION_PROMOTION_FAILURE_CASE.POST_STAGING_EDIT) {
        const writer = new RecordingDocumentationAtomicWriter();
        const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
        const promoter = new InterveningDocumentationEditPromoter(
          options.productDir,
          interveningPath,
          interveningContent,
          filesystem.promoteDocumentation,
        );
        error = await captureError(async () =>
          await composeDocumentationSync({ ...options, promoteDocumentation: promoter.promote })
        );
        atomicWriteCount = writer.writes;
      } else {
        const writer = new InterveningDuringPromotionAtomicWriter(
          join(options.productDir, interveningPath),
          interveningContent,
        );
        const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
        error = await captureError(async () =>
          await composeDocumentationSync({ ...options, promoteDocumentation: filesystem.promoteDocumentation })
        );
      }
    }
    observation = {
      scenario,
      actual: (await observeDocumentationContent(scenario, readProductDocument)).actual,
      failureCase,
      interveningPath,
      error,
      atomicWriteCount,
      atomicFailureCount,
    };
  });
  if (observation === undefined) throw new Error("Documentation promotion failure produced no observation");
  return observation;
}

async function observeDocumentationAudit(auditCase: DocumentationAuditCase): Promise<DocumentationAuditObservation> {
  const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
  const promoter = new RecordingDocumentationPromoter();
  let observation: DocumentationAuditObservation | undefined;
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    let actualReleaseData: ReleaseData | undefined;
    let actualDocuments: readonly unknown[] = [];
    let error: unknown;
    try {
      await composeDocumentationSync({
        ...options,
        faithfulnessAuditor: async ({ releaseData, documents }) => {
          actualReleaseData = releaseData;
          actualDocuments = auditCase === DOCUMENTATION_AUDIT_CASE.REJECT_BEFORE_PROMOTION
            ? documents.map(({ path }) => path)
            : documents;
          if (auditCase === DOCUMENTATION_AUDIT_CASE.REJECT_BEFORE_PROMOTION) {
            await rejectingDocumentationAuditor({ releaseData, documents });
          }
        },
        promoteDocumentation: promoter.promote,
      });
    } catch (caught) {
      error = caught;
    }
    const content = await observeDocumentationContent(scenario, readProductDocument);
    observation = {
      ...content,
      auditCase,
      error,
      actualReleaseData,
      actualDocuments,
      promotionCallCount: promoter.calls.length,
    };
  });
  if (observation === undefined) throw new Error("Documentation audit produced no observation");
  return observation;
}

async function observeDocumentationPrompt(
  promptCase: DocumentationPromptCase,
): Promise<DocumentationPromptObservation> {
  const scenario = sampleReleaseTestValue(
    promptCase === DOCUMENTATION_PROMPT_CASE.DATA_BOUNDARY
      ? arbitraryPromptBoundaryDocumentationSyncScenario()
      : arbitraryConfiguredDocumentationSyncScenario(),
  );
  const auditor = new RecordingDocumentationAuditor();
  let observation: DocumentationPromptObservation | undefined;
  await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
    await composeDocumentationSync({
      ...options,
      faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
    });
    const producerRequest = requiredAgentRequest(agent.requests, "producer");
    const auditRequest = requiredAgentRequest(auditor.requests, "audit");
    observation = {
      scenario,
      producerWorkingDirectory: producerRequest.workingDirectory,
      producerRequestCount: agent.requests.length,
      actualProducerInput: parseDocumentationSyncPromptInput(producerRequest.prompt),
      producerInstruction: documentationSyncPromptInstruction(producerRequest.prompt),
      encodedVersion: encodeReleasePromptData(scenario.releaseData.version),
      auditRequestCount: auditor.requests.length,
      actualAuditInput: parseDocumentationPromptDataBlock(auditRequest.prompt),
      auditInstruction: documentationSyncPromptInstruction(auditRequest.prompt),
      producerPrompt: producerRequest.prompt,
    };
  });
  if (observation === undefined) throw new Error("Documentation prompt produced no observation");
  return observation;
}

async function captureError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error;
  }
}

async function materializeDocumentationPathFailure(
  failureCase: DocumentationPathFailureCase,
  productDir: string,
  externalDir: string,
): Promise<void> {
  switch (failureCase.kind) {
    case DOCUMENTATION_PATH_FAILURE_KIND.CANONICAL_ESCAPE:
      await writeFile(join(externalDir, failureCase.backingPath), failureCase.backingContent);
      await symlink(externalDir, join(productDir, failureCase.linkPath), "dir");
      return;
    case DOCUMENTATION_PATH_FAILURE_KIND.FINAL_SYMLINK:
      await writeFile(join(productDir, failureCase.backingPath), failureCase.backingContent);
      await symlink(join(productDir, failureCase.backingPath), join(productDir, failureCase.linkPath), "file");
      return;
    case DOCUMENTATION_PATH_FAILURE_KIND.DIRECTORY_TARGET:
      await mkdir(join(productDir, failureCase.configuredPath), { recursive: true });
      return;
    case DOCUMENTATION_PATH_FAILURE_KIND.TRAVERSAL:
    case DOCUMENTATION_PATH_FAILURE_KIND.MISSING_FILE:
      return;
  }
}

function parseDocumentationPromptDataBlock(prompt: string): unknown {
  const blockStart = prompt.indexOf(DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN);
  const blockEnd = prompt.lastIndexOf(DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE);
  if (
    blockStart < 0
    || blockEnd < 0
    || prompt.indexOf(DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE) !== blockEnd
  ) {
    throw new Error("Documentation prompt contains an invalid data envelope");
  }
  const encodedStart = blockStart + DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN.length;
  return JSON.parse(prompt.slice(encodedStart, blockEnd).trim());
}

async function runDocumentationSyncCli(options: ComposeDocumentationSyncOptions): Promise<void> {
  const stderr: string[] = [];
  const program = new Command();
  const invocation: CliInvocation = {
    io: {
      writeStdout: () => undefined,
      writeStderr: (output) => stderr.push(output),
      setExitCode: () => undefined,
      exit: () => {
        throw new Error(stderr.join(""));
      },
    },
    resolveEffectiveInvocationDir: () => options.productDir,
    resolveProductContext: () => ({
      effectiveInvocationDir: options.productDir,
      productDir: options.productDir,
    }),
  };
  createReleaseDomain({
    createDocumentationAgentRunner: () => options.agentRunner,
    createDocumentationFaithfulnessAuditor: () => options.faithfulnessAuditor,
    documentationSyncCommandDependencies: {
      ...DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
      resolveReleaseData: () => Promise.resolve(options.releaseData),
    },
  }).register(program, invocation);
  await program.parseAsync(
    [RELEASE_CLI.COMMAND, RELEASE_CLI.DOCS_COMMAND, RELEASE_CLI.SYNC_COMMAND],
    { from: SPX_COMMANDER_PARSE_SOURCE },
  );
}

export {
  AGENT_FILE_TOOL_PATH_INPUT_FIELD,
  AGENT_PERMISSION_MODES,
  AGENT_PRE_TOOL_USE_HOOK_EVENT,
  AGENT_TOOL_PERMISSION_BEHAVIOR,
  type AgentRunner,
  type AgentRunRequest,
  approvingDocumentationAuditor,
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryDefaultDocumentationSyncScenario,
  arbitraryDocumentationAgentFileToolBoundaryScenario,
  arbitraryDocumentationPathAliasCases,
  arbitraryDocumentationVersionPreservationScenarios,
  arbitraryDomainLiteral,
  arbitraryDuplicateDocumentationPathSet,
  arbitraryFirstReleaseDocumentationSyncScenario,
  arbitraryMultiDocumentSyncScenario,
  arbitraryNestedDocumentationSyncScenario,
  arbitraryPromptBoundaryDocumentationSyncScenario,
  arbitraryReleaseVersionVariantOnlyScenario,
  arbitrarySingleDocumentSyncScenario,
  arbitrarySparseDocumentationPathSet,
  arbitraryUnrelatedVersionRewriteScenario,
  arbitraryVersionlessSubsequentReleaseDocumentationSyncScenario,
  composeDocumentationSync,
  composeWithDocumentationFilesystem,
  CONFIG_FILE_FORMAT,
  createAgentRunOptions,
  createDocumentationAtomicWriter,
  createDocumentationFaithfulnessAuditor,
  createDocumentationSyncFilesystem,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES,
  DEFAULT_RELEASE_DOCUMENTATION_PATHS,
  delay,
  DIAGNOSE_SECTION,
  dirname,
  DOCUMENTATION_AUDIT_CASE,
  DOCUMENTATION_FAILURE_CASE,
  DOCUMENTATION_FIFO_BLOCK_DETECTION_MS,
  DOCUMENTATION_FIFO_COMMAND,
  DOCUMENTATION_FIFO_STAGE_OUTCOME,
  DOCUMENTATION_IDENTITY_CASE,
  DOCUMENTATION_PATH_FAILURE_KIND,
  DOCUMENTATION_PATH_SEMANTICS,
  DOCUMENTATION_PROMOTION_FAILURE_CASE,
  DOCUMENTATION_PROMPT_CASE,
  DOCUMENTATION_READ_RACE_TARGET,
  DOCUMENTATION_ROLLBACK_CASE,
  DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  DOCUMENTATION_TEXT_ENCODING,
  DOCUMENTATION_VERSION_VALIDATION_CASE,
  type DocumentationAgentFileToolBoundaryScenario,
  type DocumentationFailureControls,
  type DocumentationPathAliasCase,
  type DocumentationPathFailureCase,
  documentationPathFailureCases,
  documentationPathMappingCases,
  type DocumentationReadRaceTarget,
  documentationSyncPromptInstruction,
  type DocumentationSyncScenario,
  type DocumentationUnrelatedVersionRewriteScenario,
  type DocumentationUpdatedContent,
  DocumentationWritingAgent,
  encodeReleasePromptData,
  execa,
  EXTERNAL_DIRECTORY_PREFIX,
  FailingDocumentationAgent,
  failingDocumentationReader,
  FailingSecondDocumentationAtomicWriter,
  FirstDocumentationWritingAgent,
  IdentityReplacingDocumentationAtomicWriter,
  InterveningDocumentationEditPromoter,
  InterveningDocumentationIdentityPromoter,
  InterveningDuringPromotionAtomicWriter,
  isPathContained,
  join,
  lastDocumentationPath,
  link,
  materializeDocumentationPathFailure,
  mkdir,
  observeAtomicDocumentationPromotion,
  observeConfiguredDocumentationPathSet,
  observeConfiguredDocumentationSync,
  observeDefaultDocumentationSync,
  observeDocumentationAgentFileToolBoundary,
  observeDocumentationAudit,
  observeDocumentationFailure,
  observeDocumentationFifoRejection,
  observeDocumentationIdentityRejection,
  observeDocumentationPathAliases,
  observeDocumentationPathFailures,
  observeDocumentationPathMappings,
  observeDocumentationPathSemantics,
  observeDocumentationPromotionFailure,
  observeDocumentationPrompt,
  observeDocumentationRollback,
  observeDocumentationVersionPreservation,
  observeDocumentationVersionValidation,
  observeFirstReleaseDocumentationSync,
  observeIndependentDocumentationConfigResolution,
  observeUnrelatedVersionRewrite,
  observeVersionlessSubsequentReleaseDocumentationSync,
  open,
  parseDocumentationPromptDataBlock,
  parseDocumentationSyncPromptInput,
  PartiallyUpdatingDocumentationAgent,
  PassiveDocumentationAgent,
  posix,
  PostPromotionEditFailingAtomicWriter,
  PostRenameIdentityReplacingAtomicFileSystem,
  primaryDocumentation,
  PRODUCT_DIRECTORY_PREFIX,
  type ProductDocumentationReader,
  readFile,
  realpath,
  RecordingDocumentationAtomicWriter,
  RecordingDocumentationAuditor,
  RecordingDocumentationPromoter,
  REJECTING_DOCUMENTATION_AUDIT_MESSAGE,
  rejectingDocumentationAuditor,
  RELEASE_CONFIG_FIELDS,
  RELEASE_SECTION,
  releaseConfigDescriptor,
  rename,
  resolveCanonicalDocumentationTarget,
  RetargetingDocumentationCanonicalPathResolver,
  RetargetingDocumentationFileOpener,
  rm,
  runDocumentationSyncCli,
  sampleReleaseTestValue,
  serializeConfigFileSections,
  StagedSymlinkReplacingAgent,
  TrackingDocumentationFileOpener,
  withDocumentationScenario,
  withTempDir,
  writeFile,
};
