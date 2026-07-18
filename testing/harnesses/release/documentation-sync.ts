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
  readonly actual: readonly { readonly path: string; readonly content: string }[];
  readonly expected: readonly { readonly path: string; readonly content: string | undefined }[];
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
    actual: await Promise.all(
      scenario.paths.map(async (path) => ({ path, content: await readProductDocument(path) })),
    ),
    expected: scenario.paths.map((path) => ({ path, content: scenario.updated[path] })),
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
  readonly actual: readonly string[];
  readonly expected: readonly string[];
}

interface DocumentationPathSemanticsObservation {
  readonly actual: string | undefined;
  readonly expected: string;
}

interface DocumentationPathAliasObservation {
  readonly actualDocumentCount: number;
  readonly actualSourcePath: string;
  readonly expectedSourcePath: string;
  readonly actualTargetPath: string;
  readonly expectedTargetPath: string;
  readonly actualStagedPath: string;
  readonly expectedStagedPath: string;
  readonly actualContent: string;
  readonly expectedContent: string;
}

interface DocumentationConfigObservation {
  readonly actual: Awaited<
    ReturnType<typeof DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES.resolveDocumentationConfig>
  >;
  readonly expected: DocumentationSyncScenario["config"];
}

async function observeDocumentationPathMappings(): Promise<readonly DocumentationPathMappingObservation[]> {
  const observations: DocumentationPathMappingObservation[] = [];
  for (const { scenario, expected } of documentationPathMappingCases()) {
    await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
      await runDocumentationSyncCli(options);
      observations.push({
        actual: parseDocumentationSyncPromptInput(requiredAgentRequest(agent.requests, "producer").prompt)
          .documents.map(({ sourcePath }) => sourcePath),
        expected,
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
      expected: operations.resolve(productDir, sourcePath),
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
          actualDocumentCount: stage.documents.length,
          actualSourcePath: document.sourcePath,
          expectedSourcePath: aliasCase.configuredPath,
          actualTargetPath: document.targetPath,
          expectedTargetPath: await realpath(canonicalPath),
          actualStagedPath: document.stagedPath,
          expectedStagedPath: join(stage.workingDirectory, aliasCase.canonicalPath),
          actualContent: await filesystem.readDocument(stage.workingDirectory, document.stagedPath),
          expectedContent: aliasCase.content,
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
      actual: await DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES.resolveDocumentationConfig(productDir),
      expected: scenario.config,
    };
  });
}

interface DocumentationPathSetObservation {
  readonly actual: readonly string[];
  readonly expected: readonly string[];
}

type DocumentationVersionPreservationObservation = DocumentationContentObservation;

interface DocumentationUnrelatedVersionRewriteObservation extends DocumentationContentObservation {
  readonly error: unknown;
  readonly actualAuditDocuments: readonly { readonly path: string; readonly updatedContent: string }[];
  readonly expectedAuditDocuments: readonly { readonly path: string; readonly updatedContent: string | undefined }[];
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
      actual: parseDocumentationSyncPromptInput(requiredAgentRequest(agent.requests, "producer").prompt)
        .documents.map(({ sourcePath }) => sourcePath),
      expected: scenario.paths,
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
      actual: content.actual,
      expected: testCase.scenario.paths.map((path) => ({
        path,
        content: testCase.scenario.original[path],
      })),
      error,
      actualAuditDocuments,
      expectedAuditDocuments: testCase.scenario.paths.map((path) => ({
        path,
        updatedContent: testCase.rewritten[path],
      })),
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
  DOCUMENTATION_FIFO_BLOCK_DETECTION_MS,
  DOCUMENTATION_FIFO_COMMAND,
  DOCUMENTATION_FIFO_STAGE_OUTCOME,
  DOCUMENTATION_PATH_FAILURE_KIND,
  DOCUMENTATION_PATH_SEMANTICS,
  DOCUMENTATION_READ_RACE_TARGET,
  DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  DOCUMENTATION_TEXT_ENCODING,
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
  observeConfiguredDocumentationPathSet,
  observeConfiguredDocumentationSync,
  observeDefaultDocumentationSync,
  observeDocumentationAgentFileToolBoundary,
  observeDocumentationPathAliases,
  observeDocumentationPathMappings,
  observeDocumentationPathSemantics,
  observeDocumentationVersionPreservation,
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
