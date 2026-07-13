import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { Command } from "commander";
import { expect } from "vitest";

import type { AgentAuditor, AgentAuditRequest, AgentRunner, AgentRunRequest } from "@/agent/agent-runner";
import { DEFAULT_DOCUMENTATION_SYNC_COMMAND_DEPENDENCIES } from "@/commands/release/documentation-sync";
import { createDocumentationSyncFilesystem } from "@/commands/release/documentation-sync-filesystem";
import { CONFIG_FILE_FORMAT, DEFAULT_CONFIG_FILENAME, serializeConfigFileSections } from "@/config/index";
import { DEFAULT_RELEASE_DOCUMENTATION_PATHS, RELEASE_CONFIG_FIELDS, RELEASE_SECTION } from "@/domains/release/config";
import {
  composeDocumentationSync,
  type ComposeDocumentationSyncOptions,
  createDocumentationFaithfulnessAuditor,
  DOCUMENTATION_SYNC_AUDIT_APPROVED,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN,
  DOCUMENTATION_SYNC_PROMPT_INSTRUCTION,
  type DocumentationFaithfulnessAuditor,
  type DocumentationReader,
} from "@/domains/release/documentation-sync";
import { encodeReleasePromptData } from "@/domains/release/prompt-data";
import { type CliInvocation, SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createReleaseDomain, RELEASE_CLI } from "@/interfaces/cli/release";
import {
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryDefaultDocumentationSyncScenario,
  arbitraryPromptBoundaryDocumentationSyncScenario,
  documentationPathMappingCases,
  type DocumentationSyncScenario,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PRODUCT_DIRECTORY_PREFIX = "spx-documentation-sync-";
const TRAILING_VERSION_REFERENCE = /([^\n]+)\n$/u;

class DocumentationWritingAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    const input = parseDocumentationSyncPromptInput(request.prompt);
    for (const path of input.documents) {
      const content = await readFile(path.stagedPath, "utf8");
      const priorVersion = content.match(TRAILING_VERSION_REFERENCE)?.[1];
      if (priorVersion === undefined) {
        throw new Error(`No trailing version reference in ${path.sourcePath}`);
      }
      await writeFile(
        path.stagedPath,
        content.replaceAll(priorVersion, input.releaseData.version),
      );
    }
  }
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
    const agent = new DocumentationWritingAgent();
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
  });
}

function registerComplianceTests(): void {
  describe("documentation sync compliance", () => {
    it("audits the read-back set before promoting any document", async () => {
      const scenario = sampleReleaseTestValue(arbitraryConfiguredDocumentationSyncScenario());
      let promoted = false;
      await withDocumentationScenario(scenario, async (options, readProductDocument) => {
        await expect(composeDocumentationSync({
          ...options,
          faithfulnessAuditor: async ({ releaseData, documents }) => {
            expect(releaseData).toBe(scenario.releaseData);
            expect(documents.map(({ path }) => path)).toEqual(scenario.paths);
            throw new Error("Documentation faithfulness rejected");
          },
          promoteDocumentation: async () => {
            promoted = true;
          },
        })).rejects.toThrow("Documentation faithfulness rejected");
        expect(promoted).toBe(false);
        for (const path of scenario.paths) {
          await expect(readProductDocument(path)).resolves.toBe(scenario.original[path]);
        }
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
          documents: scenario.paths.map((path) => ({ path, content: scenario.updated[path] })),
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
export const documentationSyncComplianceCases = collectHarnessTestCases(registerComplianceTests);
