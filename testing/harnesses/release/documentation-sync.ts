import { mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, win32 } from "node:path";

import { Command } from "commander";
import { expect } from "vitest";

import type { AgentAuditor, AgentAuditRequest, AgentRunner, AgentRunRequest } from "@/agent/agent-runner";
import { DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES } from "@/commands/release/documentation-sync";
import {
  createDocumentationSyncFilesystem,
  type DocumentationAtomicWriter,
  resolveCanonicalDocumentationTarget,
} from "@/commands/release/documentation-sync-filesystem";
import { CONFIG_FILE_FORMAT, DEFAULT_CONFIG_FILENAME, serializeConfigFileSections } from "@/config/index";
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
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN,
  DOCUMENTATION_SYNC_PROMPT_INSTRUCTION,
  type DocumentationFaithfulnessAuditor,
  type DocumentationPromoter,
  type DocumentationReader,
} from "@/domains/release/documentation-sync";
import { encodeReleasePromptData } from "@/domains/release/prompt-data";
import { type ReleaseData, releaseVersionFromTag } from "@/domains/release/release-data";
import { type CliInvocation, SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createReleaseDomain, RELEASE_CLI } from "@/interfaces/cli/release";
import {
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryDefaultDocumentationSyncScenario,
  arbitraryDocumentationPathAliasCase,
  arbitraryDocumentationVersionPreservationScenarios,
  arbitraryDuplicateDocumentationPathSet,
  arbitraryFirstReleaseDocumentationSyncScenario,
  arbitraryMultiDocumentSyncScenario,
  arbitraryNestedDocumentationSyncScenario,
  arbitraryPromptBoundaryDocumentationSyncScenario,
  arbitraryReleaseVersionVariantOnlyScenario,
  DOCUMENTATION_PATH_FAILURE_KIND,
  type DocumentationPathAliasCase,
  type DocumentationPathFailureCase,
  documentationPathFailureCases,
  documentationPathMappingCases,
  type DocumentationSyncScenario,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PRODUCT_DIRECTORY_PREFIX = "spx-documentation-sync-";
const EXTERNAL_DIRECTORY_PREFIX = "spx-documentation-sync-external-";
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

  readonly write: DocumentationAtomicWriter = async (path, content) => {
    if (this.successfulWrites === 1 && this.failures === 0) {
      this.failures += 1;
      throw new Error("Second documentation promotion failed");
    }
    await writeFile(path, content);
    this.successfulWrites += 1;
  };
}

class RecordingDocumentationAtomicWriter {
  writes = 0;

  readonly write: DocumentationAtomicWriter = async (path, content) => {
    this.writes += 1;
    await writeFile(path, content);
  };
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

interface DocumentationFailureControls {
  readonly agentRunner?: AgentRunner;
  readonly readDocument?: DocumentationReader;
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
    readProductDocument: DocumentationReader,
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

const failingDocumentationReader: DocumentationReader = async () => {
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
  const prefix = `${DOCUMENTATION_SYNC_PROMPT_INSTRUCTION}\n\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN}\n`;
  const suffix = `\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}`;
  if (!prompt.startsWith(prefix) || !prompt.endsWith(suffix)) {
    throw new Error("Documentation sync prompt does not match its source-owned envelope");
  }
  return parseDocumentationPromptDataBlock(prompt) as {
    readonly releaseData: DocumentationSyncScenario["releaseData"];
    readonly documents: readonly { readonly sourcePath: string; readonly stagedPath: string }[];
  };
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
  readProductDocument: DocumentationReader,
): Promise<void> {
  for (const path of scenario.paths) {
    await expect(readProductDocument(path)).resolves.toBe(scenario.original[path]);
  }
}

async function expectOnlyInterveningDocumentationEdit(
  scenario: DocumentationSyncScenario,
  interveningPath: string,
  readProductDocument: DocumentationReader,
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
      await expect(filesystem.readDocument(stage.documents[0].stagedPath)).resolves.toBe(aliasCase.content);
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

    it("resolves a backslash-separated configured path to its canonical staged document", async () => {
      await assertDocumentationPathAliasResolves(
        sampleReleaseTestValue(arbitraryDocumentationPathAliasCase()),
      );
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

    it("rejects every generated duplicate-bearing configured documentation path set", async () => {
      await assertProperty(
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
        expect(agent.requests[0].prompt).toBe(
          `${DOCUMENTATION_SYNC_PROMPT_INSTRUCTION}\n\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN}\n${
            encodeReleasePromptData({
              releaseData: scenario.releaseData,
              documents: scenario.paths.map((sourcePath) => ({
                sourcePath,
                stagedPath: join(agent.requests[0].workingDirectory, sourcePath),
              })),
            })
          }\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}`,
        );
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
