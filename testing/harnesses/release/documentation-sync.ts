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
  DOCUMENTATION_PATHS_DATA_BLOCK_CLOSE,
  DOCUMENTATION_PATHS_DATA_BLOCK_OPEN,
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
  type DocumentationSyncScenario,
} from "@testing/generators/release/documentation";
import { sampleReleaseTestValue } from "@testing/generators/release/release";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { collectHarnessTestCases, describe, it } from "@testing/harnesses/vitest-registration";

const PRODUCT_DIRECTORY_PREFIX = "spx-documentation-sync-";
const STAGE_DIRECTORY_PREFIX = "spx-documentation-stage-";

class DocumentationWritingAgent implements AgentRunner {
  readonly requests: AgentRunRequest[] = [];

  constructor(private readonly updated: Readonly<Partial<Record<string, string>>>) {}

  async run(request: AgentRunRequest): Promise<void> {
    this.requests.push(request);
    for (const path of promptDocumentationPaths(request.prompt)) {
      const content = this.updated[path.sourcePath];
      if (content === undefined) throw new Error(`No generated documentation for ${path.sourcePath}`);
      await writeFile(path.stagedPath, content);
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
    const agent = new DocumentationWritingAgent(scenario.updated);
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
    return { sourcePath, stagedPath };
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

function promptDocumentationPaths(prompt: string): readonly { sourcePath: string; stagedPath: string }[] {
  const start = prompt.indexOf(DOCUMENTATION_PATHS_DATA_BLOCK_OPEN);
  const end = prompt.indexOf(DOCUMENTATION_PATHS_DATA_BLOCK_CLOSE, start);
  if (start < 0 || end < 0) throw new Error("Documentation paths block is absent from prompt");
  return JSON.parse(
    prompt.slice(start + DOCUMENTATION_PATHS_DATA_BLOCK_OPEN.length, end).trim(),
  ) as readonly { sourcePath: string; stagedPath: string }[];
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
    documentationSyncCommand: async ({ productDir, agentRunner }) => {
      const result = await composeDocumentationSync({ ...options, productDir, agentRunner });
      return result.paths;
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
    it("maps omitted configuration to the product README", () => {
      expect(resolveDocumentationPaths({})).toEqual(DEFAULT_RELEASE_DOCUMENTATION_PATHS);
    });

    it("maps every configured documentation path set in declared order", () => {
      assertProperty(
        arbitraryConfiguredDocumentationSyncScenario(),
        (scenario) => {
          expect(resolveDocumentationPaths(scenario.config)).toEqual(scenario.paths);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
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
        expect(agent.requests[0].prompt).toContain(scenario.releaseData.version);
        expect(promptDocumentationPaths(agent.requests[0].prompt).map(({ sourcePath }) => sourcePath)).toEqual(
          scenario.paths,
        );
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
