import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { Command } from "commander";
import { expect } from "vitest";

import type { AgentRunner, AgentRunRequest } from "@/agent/agent-runner";
import { DEFAULT_RELEASE_DOCUMENTATION_PATHS } from "@/domains/release/config";
import {
  composeDocumentationSync,
  type ComposeDocumentationSyncOptions,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE,
  DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN,
  DOCUMENTATION_SYNC_PROMPT_INSTRUCTION,
  type DocumentationFaithfulnessAuditor,
  type DocumentationPromoter,
  type DocumentationReader,
  type DocumentationStager,
  resolveDocumentationPaths,
} from "@/domains/release/documentation-sync";
import { type CliInvocation, SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createReleaseDomain, RELEASE_CLI } from "@/interfaces/cli/release";
import {
  arbitraryConfiguredDocumentationSyncScenario,
  arbitraryDefaultDocumentationSyncScenario,
  documentationPathMappingCases,
  type DocumentationSyncScenario,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";

const PRODUCT_DIRECTORY_PREFIX = "spx-documentation-sync-";
const STAGE_DIRECTORY_PREFIX = "spx-documentation-stage-";
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

async function withDocumentationScenario(
  scenario: DocumentationSyncScenario,
  run: (
    options: ComposeDocumentationSyncOptions,
    readProductDocument: DocumentationReader,
    agent: DocumentationWritingAgent,
  ) => Promise<void>,
): Promise<void> {
  const productDir = await mkdtemp(join(tmpdir(), PRODUCT_DIRECTORY_PREFIX));
  try {
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
    const agent = new DocumentationWritingAgent();
    await run(
      {
        releaseData: scenario.releaseData,
        config: scenario.config,
        productDir,
        agentRunner: agent,
        stageDocumentation: realDocumentationStager,
        readDocument: (path) => readFile(path, "utf8"),
        promoteDocumentation: realDocumentationPromoter,
        faithfulnessAuditor: approvingDocumentationAuditor,
      },
      (path) => readFile(join(productDir, path), "utf8"),
      agent,
    );
  } finally {
    await rm(productDir, { recursive: true, force: true });
  }
}

const realDocumentationStager: DocumentationStager = async (productDir, paths) => {
  const workingDirectory = await mkdtemp(join(tmpdir(), STAGE_DIRECTORY_PREFIX));
  const documents = await Promise.all(paths.map(async (sourcePath) => {
    const stagedPath = join(workingDirectory, sourcePath);
    await mkdir(dirname(stagedPath), { recursive: true });
    await writeFile(stagedPath, await readFile(join(productDir, sourcePath), "utf8"));
    return { sourcePath, stagedPath, targetPath: join(productDir, sourcePath) };
  }));
  return {
    workingDirectory,
    documents,
    cleanup: () => rm(workingDirectory, { recursive: true, force: true }),
  };
};

const realDocumentationPromoter: DocumentationPromoter = async (documents) => {
  await Promise.all(documents.map(({ path, content }) => writeFile(path, content)));
};

const approvingDocumentationAuditor: DocumentationFaithfulnessAuditor = async () => {};

function parseDocumentationSyncPromptInput(prompt: string): {
  readonly releaseData: DocumentationSyncScenario["releaseData"];
  readonly documents: readonly { readonly sourcePath: string; readonly stagedPath: string }[];
} {
  const prefix = `${DOCUMENTATION_SYNC_PROMPT_INSTRUCTION}\n\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_OPEN}\n`;
  const suffix = `\n${DOCUMENTATION_SYNC_PROMPT_DATA_BLOCK_CLOSE}`;
  if (!prompt.startsWith(prefix) || !prompt.endsWith(suffix)) {
    throw new Error("Documentation sync prompt does not match its source-owned envelope");
  }
  return JSON.parse(prompt.slice(prefix.length, -suffix.length)) as {
    readonly releaseData: DocumentationSyncScenario["releaseData"];
    readonly documents: readonly { readonly sourcePath: string; readonly stagedPath: string }[];
  };
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
      resolveReleaseData: () => Promise.resolve(options.releaseData),
      resolveDocumentationConfig: () => Promise.resolve(options.config),
      stageDocumentation: options.stageDocumentation,
      readDocument: options.readDocument,
      promoteDocumentation: options.promoteDocumentation,
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
    it.each(documentationPathMappingCases())("maps %s documentation paths", ({ config, expected }) => {
      expect(resolveDocumentationPaths(config)).toEqual(expected);
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
            JSON.stringify({
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
