import { constants } from "node:fs";
import { link, lstat, mkdir, open, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, win32 } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { Command } from "commander";
import { execa } from "execa";
import { expect } from "vitest";

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
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
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

class FileToolBoundaryDocumentationAgent implements AgentRunner {
  private readonly writer: DocumentationWritingAgent;

  constructor(
    updated: DocumentationSyncScenario["updated"],
    private readonly scenario: DocumentationAgentFileToolBoundaryScenario,
  ) {
    this.writer = new DocumentationWritingAgent(updated);
  }

  async run(request: AgentRunRequest): Promise<void> {
    await assertAgentRunRequestFileToolBoundary(request, this.scenario);
    await this.writer.run(request);
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
  throw new Error("Documentation faithfulness rejected");
};

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

async function expectProductDocumentationUnchanged(
  scenario: DocumentationSyncScenario,
  readProductDocument: ProductDocumentationReader,
): Promise<void> {
  for (const path of scenario.paths) {
    await expect(readProductDocument(path)).resolves.toBe(scenario.original[path]);
  }
}

async function expectOnlyInterveningDocumentationEdit(
  scenario: DocumentationSyncScenario,
  interveningPath: string,
  readProductDocument: ProductDocumentationReader,
): Promise<void> {
  for (const path of scenario.paths) {
    await expect(readProductDocument(path)).resolves.toBe(
      path === interveningPath ? scenario.intervening[path] : scenario.original[path],
    );
  }
}

async function assertDocumentationFailureLeavesProductUnchanged(
  scenario: DocumentationSyncScenario,
  controls: DocumentationFailureControls,
): Promise<void> {
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    await expect(composeDocumentationSync({
      ...options,
      ...controls,
      promoteDocumentation: promoter.promote,
    })).rejects.toThrow();
    expect(promoter.calls).toHaveLength(0);
    await expectProductDocumentationUnchanged(scenario, readProductDocument);
  });
}

async function assertDuplicateDocumentationIdentityRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primaryPath = scenario.paths.at(0);
  const aliasPath = scenario.paths.at(1);
  if (primaryPath === undefined || aliasPath === undefined) {
    throw new Error("Generated documentation identity case requires two paths");
  }
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
    await rm(join(options.productDir, aliasPath));
    await link(
      join(options.productDir, primaryPath),
      join(options.productDir, aliasPath),
    );
    await expect(composeDocumentationSync({
      ...options,
      promoteDocumentation: promoter.promote,
    })).rejects.toThrow();
    expect(agent.requests).toHaveLength(0);
    expect(promoter.calls).toHaveLength(0);
    await expectProductDocumentationUnchanged(scenario, readProductDocument);
  });
}

async function assertFifoRejectedWithoutBlocking(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
    const fifoPath = join(options.productDir, primary.path);
    await rm(fifoPath);
    await execa(DOCUMENTATION_FIFO_COMMAND, [fifoPath]);
    const sync = composeDocumentationSync({
      ...options,
      promoteDocumentation: promoter.promote,
    });
    const outcome = await Promise.race([
      sync.then(
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.RESOLVED,
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.REJECTED,
      ),
      delay(DOCUMENTATION_FIFO_BLOCK_DETECTION_MS).then(
        () => DOCUMENTATION_FIFO_STAGE_OUTCOME.BLOCKED,
      ),
    ]);
    if (outcome === DOCUMENTATION_FIFO_STAGE_OUTCOME.BLOCKED) {
      await Promise.allSettled([
        sync,
        writeFile(fifoPath, primary.originalContent),
      ]);
    }
    expect(outcome).toBe(DOCUMENTATION_FIFO_STAGE_OUTCOME.REJECTED);
    expect(agent.requests).toHaveLength(0);
    expect(promoter.calls).toHaveLength(0);
  });
}

async function assertUnrelatedVersionRewriteRejected(
  testCase: DocumentationUnrelatedVersionRewriteScenario,
): Promise<void> {
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(testCase.scenario, async (options, readProductDocument) => {
    await expect(composeDocumentationSync({
      ...options,
      agentRunner: new DocumentationWritingAgent(testCase.rewritten),
      faithfulnessAuditor: async (request) => {
        expect(request.documents.map(({ path, updatedContent }) => ({ path, updatedContent }))).toEqual(
          testCase.scenario.paths.map((path) => ({
            path,
            updatedContent: testCase.rewritten[path],
          })),
        );
        await rejectingDocumentationAuditor(request);
      },
      promoteDocumentation: promoter.promote,
    })).rejects.toThrow();
    expect(promoter.calls).toHaveLength(0);
    await expectProductDocumentationUnchanged(testCase.scenario, readProductDocument);
  });
}

async function assertDocumentationAgentFileToolBoundary(
  scenario: DocumentationAgentFileToolBoundaryScenario,
): Promise<void> {
  const documentationScenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
  await withDocumentationScenario(documentationScenario, async (options) => {
    await composeDocumentationSync({
      ...options,
      agentRunner: new FileToolBoundaryDocumentationAgent(documentationScenario.updated, scenario),
    });
  });
}

async function assertAgentRunRequestFileToolBoundary(
  request: AgentRunRequest,
  scenario: DocumentationAgentFileToolBoundaryScenario,
): Promise<void> {
  const promptInput = parseDocumentationSyncPromptInput(request.prompt);
  expect(promptInput.documents.every(({ stagedPath }) => isPathContained(request.workingDirectory, stagedPath)))
    .toBe(true);
  expect(request.tools).toContain(scenario.tool);
  expect(request.allowedTools).toContain(scenario.tool);
  const options = createAgentRunOptions(request);
  expect(options.permissionMode).toBe(AGENT_PERMISSION_MODES.DONT_ASK);
  expect(options.allowedTools).toContain(scenario.tool);
  const preToolUseHook = options.hooks?.PreToolUse?.at(0)?.hooks.at(0);
  if (preToolUseHook === undefined) {
    throw new Error("Agent run options do not enforce pre-tool-use containment");
  }
  const hookOptions = {
    signal: new AbortController().signal,
  };
  const containedPath = join(request.workingDirectory, posix.basename(scenario.containedPath));
  const escapedPaths = [
    scenario.escapedPaths[0],
    join(dirname(request.workingDirectory), posix.basename(scenario.escapedPaths[1])),
  ];
  await expect(
    preToolUseHook(
      {
        hook_event_name: AGENT_PRE_TOOL_USE_HOOK_EVENT,
        session_id: request.prompt,
        transcript_path: containedPath,
        cwd: request.workingDirectory,
        tool_name: scenario.tool,
        tool_input: { [AGENT_FILE_TOOL_PATH_INPUT_FIELD]: containedPath },
        tool_use_id: containedPath,
      },
      containedPath,
      hookOptions,
    ),
  ).resolves.toMatchObject({
    hookSpecificOutput: { permissionDecision: AGENT_TOOL_PERMISSION_BEHAVIOR.ALLOW },
  });
  for (const escapedPath of escapedPaths) {
    await expect(
      preToolUseHook(
        {
          hook_event_name: AGENT_PRE_TOOL_USE_HOOK_EVENT,
          session_id: request.prompt,
          transcript_path: escapedPath,
          cwd: request.workingDirectory,
          tool_name: scenario.tool,
          tool_input: { [AGENT_FILE_TOOL_PATH_INPUT_FIELD]: escapedPath },
          tool_use_id: escapedPath,
        },
        escapedPath,
        hookOptions,
      ),
    ).resolves.toMatchObject({
      hookSpecificOutput: { permissionDecision: AGENT_TOOL_PERMISSION_BEHAVIOR.DENY },
    });
  }
}

async function assertVersionValidationPrecedesFaithfulnessAudit(
  scenario: DocumentationSyncScenario,
  agentRunner: AgentRunner,
): Promise<void> {
  const auditor = new RecordingDocumentationAuditor();
  const promoter = new RecordingDocumentationPromoter();
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    await expect(composeDocumentationSync({
      ...options,
      agentRunner,
      faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
      promoteDocumentation: promoter.promote,
    })).rejects.toThrow();
    expect(auditor.requests).toHaveLength(0);
    expect(promoter.calls).toHaveLength(0);
    await expectProductDocumentationUnchanged(scenario, readProductDocument);
  });
}

async function assertStagedSymlinkRejectedBeforeAuditAndPromotion(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const sourcePath = scenario.paths.at(0);
  if (sourcePath === undefined) throw new Error("Generated documentation set is empty");
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    const auditor = new RecordingDocumentationAuditor();
    const promoter = new RecordingDocumentationPromoter();
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      await expect(composeDocumentationSync({
        ...options,
        agentRunner: new StagedSymlinkReplacingAgent(
          scenario.updated,
          sourcePath,
          join(externalDir, sourcePath),
        ),
        faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
        promoteDocumentation: promoter.promote,
      })).rejects.toThrow();
      expect(auditor.requests).toHaveLength(0);
      expect(promoter.calls).toHaveLength(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertProductStagingIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  await assertDocumentationReadIdentityChangeRejected(
    scenario,
    DOCUMENTATION_READ_RACE_TARGET.PRODUCT,
  );
}

async function assertStagedReadbackIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  await assertDocumentationReadIdentityChangeRejected(
    scenario,
    DOCUMENTATION_READ_RACE_TARGET.STAGED,
  );
}

async function assertCanonicalResolutionIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
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
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toThrow();
      expect(agent.requests).toHaveLength(0);
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertDocumentationReadIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
  target: DocumentationReadRaceTarget,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
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
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toThrow();
      if (target === DOCUMENTATION_READ_RACE_TARGET.PRODUCT) expect(agent.requests).toHaveLength(0);
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertPromotionIdentityChangeRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const canonicalProductDir = await realpath(options.productDir);
      const writer = new IdentityReplacingDocumentationAtomicWriter(
        join(canonicalProductDir, primary.path),
        join(externalDir, primary.path),
        primary.originalContent,
      );
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toThrow();
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertStagedIdentityReplacementRejected(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const writer = new RecordingDocumentationAtomicWriter();
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      const promoter = new InterveningDocumentationIdentityPromoter(
        join(options.productDir, primary.path),
        join(externalDir, primary.path),
        primary.originalContent,
        filesystem.promoteDocumentation,
      );
      await expect(composeDocumentationSync({
        ...options,
        promoteDocumentation: promoter.promote,
      })).rejects.toThrow();
      expect(writer.writes).toBe(0);
      await expectProductDocumentationUnchanged(scenario, readProductDocument);
    });
  });
}

async function assertAtomicPromotionClosesDocumentationHandles(
  scenario: DocumentationSyncScenario,
): Promise<void> {
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
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    await expect(composeWithDocumentationFilesystem(options, filesystem)).resolves.toEqual({
      paths: scenario.paths,
    });
    expect(opener.openHandleCount).toBe(0);
    for (const path of scenario.paths) {
      await expect(readProductDocument(path)).resolves.toBe(scenario.updated[path]);
    }
  });
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

async function assertRollbackPreservesPostPromotionEdit(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withDocumentationScenario(scenario, async (options, readProductDocument) => {
    const writer = new PostPromotionEditFailingAtomicWriter(
      join(options.productDir, primary.path),
      primary.interveningContent,
    );
    const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
    await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toBeInstanceOf(AggregateError);
    expect(writer.failures).toBe(1);
    await expectOnlyInterveningDocumentationEdit(scenario, primary.path, readProductDocument);
  });
}

async function assertRollbackPreservesPostPromotionIdentityReplacement(
  scenario: DocumentationSyncScenario,
): Promise<void> {
  const primary = primaryDocumentation(scenario);
  await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
    await withDocumentationScenario(scenario, async (options, readProductDocument) => {
      const fileSystem = new PostRenameIdentityReplacingAtomicFileSystem(
        join(externalDir, primary.path),
        primary.updatedContent,
      );
      const filesystem = createDocumentationSyncFilesystem({
        writeDocumentAtomic: createDocumentationAtomicWriter(fileSystem),
      });
      await expect(composeWithDocumentationFilesystem(options, filesystem)).rejects.toBeInstanceOf(AggregateError);
      expect(fileSystem.failures).toBe(1);
      for (const path of scenario.paths) {
        await expect(readProductDocument(path)).resolves.toBe(
          path === primary.path ? primary.updatedContent : scenario.original[path],
        );
      }
    });
  });
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

async function assertDocumentationPathFailure(
  failureCase: DocumentationPathFailureCase,
): Promise<void> {
  await withTempDir(PRODUCT_DIRECTORY_PREFIX, async (productDir) => {
    await withTempDir(EXTERNAL_DIRECTORY_PREFIX, async (externalDir) => {
      await materializeDocumentationPathFailure(failureCase, productDir, externalDir);
      const filesystem = createDocumentationSyncFilesystem();
      const agent = new PassiveDocumentationAgent();
      const promoter = new RecordingDocumentationPromoter();
      await expect(composeDocumentationSync({
        releaseData: failureCase.releaseData,
        config: failureCase.config,
        productDir,
        agentRunner: agent,
        stageDocumentation: filesystem.stageDocumentation,
        readDocument: filesystem.readDocument,
        promoteDocumentation: promoter.promote,
        faithfulnessAuditor: approvingDocumentationAuditor,
      })).rejects.toThrow();
      expect(agent.requests).toHaveLength(0);
      expect(promoter.calls).toHaveLength(0);
      await expectDocumentationPathBackingUnchanged(failureCase, productDir, externalDir);
    });
  });
}

async function assertDocumentationPathAliasResolves(
  aliasCase: DocumentationPathAliasCase,
): Promise<void> {
  await withTempDir(PRODUCT_DIRECTORY_PREFIX, async (productDir) => {
    const canonicalPath = join(productDir, aliasCase.canonicalPath);
    await mkdir(dirname(canonicalPath), { recursive: true });
    await writeFile(canonicalPath, aliasCase.content);
    const filesystem = createDocumentationSyncFilesystem();
    const stage = await filesystem.stageDocumentation(productDir, [aliasCase.configuredPath]);
    try {
      expect(stage.documents).toHaveLength(1);
      expect(stage.documents[0].sourcePath).toBe(aliasCase.configuredPath);
      expect(stage.documents[0].targetPath).toBe(await realpath(canonicalPath));
      expect(stage.documents[0].stagedPath).toBe(join(stage.workingDirectory, aliasCase.canonicalPath));
      await expect(
        filesystem.readDocument(stage.workingDirectory, stage.documents[0].stagedPath),
      ).resolves.toBe(aliasCase.content);
    } finally {
      await stage.cleanup();
    }
  });
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

async function expectDocumentationPathBackingUnchanged(
  failureCase: DocumentationPathFailureCase,
  productDir: string,
  externalDir: string,
): Promise<void> {
  if (failureCase.kind === DOCUMENTATION_PATH_FAILURE_KIND.CANONICAL_ESCAPE) {
    await expect(readFile(join(externalDir, failureCase.backingPath), "utf8")).resolves.toBe(
      failureCase.backingContent,
    );
  }
  if (failureCase.kind === DOCUMENTATION_PATH_FAILURE_KIND.FINAL_SYMLINK) {
    await expect(readFile(join(productDir, failureCase.backingPath), "utf8")).resolves.toBe(
      failureCase.backingContent,
    );
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

function registerScenarioTests(): void {
  describe("documentation sync scenarios", () => {
    it("updates the default product README to the released version", async () => {
      const scenario = sampleReleaseTestValue(arbitraryDefaultDocumentationSyncScenario());
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        await runDocumentationSyncCli(options);
        await expect(readProductDocument(DEFAULT_RELEASE_DOCUMENTATION_PATHS[0])).resolves.toBe(
          scenario.updated[DEFAULT_RELEASE_DOCUMENTATION_PATHS[0]],
        );
      });
    });

    it("updates every configured documentation path to the released version", async () => {
      const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        await runDocumentationSyncCli(options);
        for (const path of scenario.paths) {
          await expect(readProductDocument(path)).resolves.toBe(scenario.updated[path]);
        }
      });
    });

    it("adds the released version to first-release documentation", async () => {
      const scenario = sampleReleaseTestValue(arbitraryFirstReleaseDocumentationSyncScenario());
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        await runDocumentationSyncCli(options);
        for (const path of scenario.paths) {
          await expect(readProductDocument(path)).resolves.toBe(scenario.updated[path]);
        }
      });
    });

    it("adds the released version when subsequent-release documentation has no previous version reference", async () => {
      const scenario = sampleReleaseTestValue(arbitraryVersionlessSubsequentReleaseDocumentationSyncScenario());
      const auditor = new RecordingDocumentationAuditor();
      await withDocumentationScenario(scenario, async (options, readProductDocument, agent) => {
        await runDocumentationSyncCli({
          ...options,
          faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
        });
        expect(documentationSyncPromptInstruction(agent.requests[0].prompt)).toContain(scenario.releaseData.version);
        expect(agent.requests[0].permissionMode).toBe(AGENT_PERMISSION_MODES.DONT_ASK);
        expect(auditor.requests).toHaveLength(1);
        expect(documentationSyncPromptInstruction(auditor.requests[0].prompt)).toContain(
          DOCUMENTATION_SYNC_AUDIT_VERSIONLESS_INSTRUCTION,
        );
        for (const path of scenario.paths) {
          await expect(readProductDocument(path)).resolves.toBe(scenario.updated[path]);
        }
      });
    });
  });
}

function registerMappingTests(): void {
  describe("documentation sync path mapping", () => {
    it.each(documentationPathMappingCases())("maps %s documentation paths", async ({ scenario, expected }) => {
      await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
        await runDocumentationSyncCli(options);
        expect(
          parseDocumentationSyncPromptInput(agent.requests[0].prompt).documents.map(({ sourcePath }) => sourcePath),
        )
          .toEqual(expected);
      });
    });

    it.each(DOCUMENTATION_PATH_SEMANTICS)(
      "resolves nested slash-separated paths with $label semantics",
      ({ join: joinPath, operations }) => {
        const scenario = sampleReleaseTestValue(arbitraryNestedDocumentationSyncScenario());
        const sourcePath = scenario.paths[0];
        const productDir = joinPath(operations.sep, PRODUCT_DIRECTORY_PREFIX);
        expect(resolveCanonicalDocumentationTarget(productDir, sourcePath, operations)).toBe(
          operations.resolve(productDir, sourcePath),
        );
      },
    );

    it("resolves configured path aliases to their canonical staged documents", async () => {
      const aliasCases = sampleReleaseTestValue(arbitraryDocumentationPathAliasCases());
      for (const aliasCase of aliasCases) await assertDocumentationPathAliasResolves(aliasCase);
    });

    it("resolves release documentation config independently of unrelated sections", async () => {
      const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
      await withTempDir(PRODUCT_DIRECTORY_PREFIX, async (productDir) => {
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
        await expect(
          DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES.resolveDocumentationConfig(productDir),
        ).resolves.toEqual(scenario.config);
      });
    });
  });
}

function registerPropertyTests(): void {
  describe("documentation sync path properties", () => {
    it("preserves every generated configured documentation path set", async () => {
      await assertProperty(
        arbitraryConfiguredDocumentationSyncScenario(),
        async (scenario) => {
          await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
            await runDocumentationSyncCli(options);
            expect(
              parseDocumentationSyncPromptInput(agent.requests[0].prompt).documents.map(({ sourcePath }) => sourcePath),
            ).toEqual(scenario.paths);
          });
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("rejects every generated duplicate-bearing configured documentation path set", () => {
      assertProperty(
        arbitraryDuplicateDocumentationPathSet(),
        (paths) => {
          expect(
            releaseConfigDescriptor.validate({
              [RELEASE_CONFIG_FIELDS.DOCUMENTATION]: {
                [RELEASE_CONFIG_FIELDS.PATHS]: paths,
              },
            }).ok,
          ).toBe(false);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("rejects every generated sparse configured documentation path set", () => {
      assertProperty(
        arbitrarySparseDocumentationPathSet(),
        (paths) => {
          expect(
            releaseConfigDescriptor.validate({
              [RELEASE_CONFIG_FIELDS.DOCUMENTATION]: {
                [RELEASE_CONFIG_FIELDS.PATHS]: paths,
              },
            }).ok,
          ).toBe(false);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("preserves every generated unrelated semantic version across release histories", async () => {
      await assertProperty(
        arbitraryDocumentationVersionPreservationScenarios(),
        async (scenarios) => {
          for (const scenario of [scenarios.withPreviousTag, scenarios.withoutPreviousTag]) {
            await withDocumentationScenario(scenario, async (options, readProductDocument) => {
              await runDocumentationSyncCli(options);
              for (const path of scenario.paths) {
                await expect(readProductDocument(path)).resolves.toBe(scenario.updated[path]);
              }
            });
          }
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("rejects every generated unrelated semantic-version rewrite before promotion", async () => {
      await assertProperty(
        arbitraryUnrelatedVersionRewriteScenario(),
        assertUnrelatedVersionRewriteRejected,
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("confines every generated agent file read, write, and edit to the staging workspace", async () => {
      await assertProperty(
        arbitraryDocumentationAgentFileToolBoundaryScenario(),
        assertDocumentationAgentFileToolBoundary,
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

function registerComplianceTests(): void {
  describe("documentation sync compliance", () => {
    it.each(documentationPathFailureCases())(
      "rejects $label before generation or promotion",
      async (failureCase) => await assertDocumentationPathFailure(failureCase),
    );

    it("leaves product documentation unpromoted when generation fails", async () => {
      await assertDocumentationFailureLeavesProductUnchanged(
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
        { agentRunner: new FailingDocumentationAgent() },
      );
    });

    it("leaves product documentation unpromoted when staged read-back fails", async () => {
      await assertDocumentationFailureLeavesProductUnchanged(
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
        { readDocument: failingDocumentationReader },
      );
    });

    it("rejects staged symlinks before audit or promotion", async () => {
      await assertStagedSymlinkRejectedBeforeAuditAndPromotion(
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
      );
    });

    it("rejects product documentation identity changes during staging reads", async () => {
      await assertProductStagingIdentityChangeRejected(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      );
    });

    it("rejects product documentation identity changes during canonical resolution", async () => {
      await assertCanonicalResolutionIdentityChangeRejected(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      );
    });

    it("rejects staged documentation identity changes during read-back", async () => {
      await assertStagedReadbackIdentityChangeRejected(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      );
    });

    it("rejects configured documentation paths that share one file identity", async () => {
      await assertDuplicateDocumentationIdentityRejected(
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      );
    });

    it("rejects FIFO documentation paths without blocking on open", async () => {
      await assertFifoRejectedWithoutBlocking(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      );
    });

    it("validates every released version before invoking the faithfulness audit", async () => {
      await assertVersionValidationPrecedesFaithfulnessAudit(
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
        new PassiveDocumentationAgent(),
      );
    });

    it("rejects a release-version variant as the only released-version reference", async () => {
      const scenario = sampleReleaseTestValue(arbitraryReleaseVersionVariantOnlyScenario());
      await assertVersionValidationPrecedesFaithfulnessAudit(
        scenario,
        new DocumentationWritingAgent(scenario.updated),
      );
    });

    it("rejects partially updated version references before invoking the faithfulness audit", async () => {
      await assertVersionValidationPrecedesFaithfulnessAudit(
        sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario()),
        new PartiallyUpdatingDocumentationAgent(),
      );
    });

    it("validates the complete configured set before promoting any document", async () => {
      const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
      await assertDocumentationFailureLeavesProductUnchanged(scenario, {
        agentRunner: new FirstDocumentationWritingAgent(scenario.updated),
      });
    });

    it("restores earlier documents when a later atomic promotion fails", async () => {
      const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
      const writer = new FailingSecondDocumentationAtomicWriter();
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        await expect(composeDocumentationSync({
          ...options,
          promoteDocumentation: filesystem.promoteDocumentation,
        })).rejects.toThrow();
        expect(writer.failures).toBe(1);
        await expectProductDocumentationUnchanged(scenario, readProductDocument);
      });
    });

    it("leaves the complete staged set unpromoted when a document changes after staging", async () => {
      const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
      const interveningPath = scenario.paths.at(-1);
      if (interveningPath === undefined) throw new Error("Generated documentation set is empty");
      const interveningContent = scenario.intervening[interveningPath];
      if (interveningContent === undefined) throw new Error(`No intervening documentation for ${interveningPath}`);
      const writer = new RecordingDocumentationAtomicWriter();
      const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        const promoter = new InterveningDocumentationEditPromoter(
          options.productDir,
          interveningPath,
          interveningContent,
          filesystem.promoteDocumentation,
        );
        await expect(composeDocumentationSync({
          ...options,
          promoteDocumentation: promoter.promote,
        })).rejects.toThrow();
        expect(writer.writes).toBe(0);
        await expectOnlyInterveningDocumentationEdit(scenario, interveningPath, readProductDocument);
      });
    });

    it("rejects a same-content identity replacement after staging", async () => {
      await assertStagedIdentityReplacementRejected(
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      );
    });

    it("rolls back earlier writes when a later document changes during promotion", async () => {
      const scenario = sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario());
      const interveningPath = scenario.paths[1];
      const interveningContent = scenario.intervening[interveningPath];
      if (interveningContent === undefined) throw new Error(`No intervening documentation for ${interveningPath}`);
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        const writer = new InterveningDuringPromotionAtomicWriter(
          join(options.productDir, interveningPath),
          interveningContent,
        );
        const filesystem = createDocumentationSyncFilesystem({ writeDocumentAtomic: writer.write });
        await expect(composeDocumentationSync({
          ...options,
          promoteDocumentation: filesystem.promoteDocumentation,
        })).rejects.toThrow();
        await expectOnlyInterveningDocumentationEdit(scenario, interveningPath, readProductDocument);
      });
    });

    it("rejects a target identity change at the atomic replacement boundary", async () => {
      await assertPromotionIdentityChangeRejected(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      );
    });

    it("closes documentation handles before the production atomic replacement", async () => {
      await assertAtomicPromotionClosesDocumentationHandles(
        sampleReleaseTestValue(arbitrarySingleDocumentSyncScenario()),
      );
    });

    it("preserves a post-promotion edit when rollback follows a later failure", async () => {
      await assertRollbackPreservesPostPromotionEdit(
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      );
    });

    it("preserves a same-content identity replacement when rollback follows a later failure", async () => {
      await assertRollbackPreservesPostPromotionIdentityReplacement(
        sampleReleaseTestValue(arbitraryMultiDocumentSyncScenario()),
      );
    });

    it("audits the read-back set before promoting any document", async () => {
      const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
      const promoter = new RecordingDocumentationPromoter();
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        await expect(composeDocumentationSync({
          ...options,
          faithfulnessAuditor: async ({ releaseData, documents }) => {
            expect(releaseData).toBe(scenario.releaseData);
            expect(documents.map(({ path }) => path)).toEqual(scenario.paths);
            await rejectingDocumentationAuditor({ releaseData, documents });
          },
          promoteDocumentation: promoter.promote,
        })).rejects.toThrow("Documentation faithfulness rejected");
        expect(promoter.calls).toHaveLength(0);
        await expectProductDocumentationUnchanged(scenario, readProductDocument);
      });
    });

    it("audits each original-to-read-back documentation transformation", async () => {
      const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
      await withDocumentationScenario(scenario, async (options) => {
        await composeDocumentationSync({
          ...options,
          faithfulnessAuditor: async ({ releaseData, documents }) => {
            expect(releaseData).toBe(scenario.releaseData);
            expect(documents).toEqual(scenario.paths.map((path) => ({
              path,
              originalContent: scenario.original[path],
              updatedContent: scenario.updated[path],
            })));
          },
        });
      });
    });

    it("passes only release data and staged document paths to the producing agent", async () => {
      const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
      await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
        await composeDocumentationSync(options);
        expect(agent.requests).toHaveLength(1);
        expect(parseDocumentationSyncPromptInput(agent.requests[0].prompt)).toEqual({
          releaseData: scenario.releaseData,
          documents: scenario.paths.map((sourcePath) => ({
            sourcePath,
            stagedPath: join(agent.requests[0].workingDirectory, sourcePath),
          })),
        });
      });
    });

    it("keeps delimiter-shaped release data inside producer and audit data blocks", async () => {
      const scenario = sampleReleaseTestValue(arbitraryPromptBoundaryDocumentationSyncScenario());
      const auditor = new RecordingDocumentationAuditor();
      await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
        await composeDocumentationSync({
          ...options,
          faithfulnessAuditor: createDocumentationFaithfulnessAuditor(auditor, options.productDir),
        });
        expect(parseDocumentationPromptDataBlock(agent.requests[0].prompt)).toEqual({
          releaseData: scenario.releaseData,
          documents: scenario.paths.map((sourcePath) => ({
            sourcePath,
            stagedPath: join(agent.requests[0].workingDirectory, sourcePath),
          })),
        });
        expect(auditor.requests).toHaveLength(1);
        expect(parseDocumentationPromptDataBlock(auditor.requests[0].prompt)).toEqual({
          releaseData: scenario.releaseData,
          documents: scenario.paths.map((path) => ({
            path,
            originalContent: scenario.original[path],
            updatedContent: scenario.updated[path],
          })),
        });
      });
    });

    it("excludes ambient spec-tree and domain state from the producing prompt", async () => {
      const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
      await withDocumentationScenario(scenario, async (options, _readProductDocument, agent) => {
        await composeDocumentationSync(options);
        expect(agent.requests).toHaveLength(1);
        for (const { path, content } of scenario.ambientState) {
          expect(agent.requests[0].prompt).not.toContain(path);
          expect(agent.requests[0].prompt).not.toContain(content);
        }
      });
    });
  });
}

export const documentationSyncScenarioCases = collectHarnessTestCases(registerScenarioTests);
export const documentationSyncMappingCases = collectHarnessTestCases(registerMappingTests);
export const documentationSyncPropertyCases = collectHarnessTestCases(registerPropertyTests);
export const documentationSyncComplianceCases = collectHarnessTestCases(registerComplianceTests);
