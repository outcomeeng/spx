import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import * as fc from "fast-check";

import { currentStalenessInputs, NO_GIT_IDENTITY, runNodeCommand, runTestsCommand } from "@/commands/test";
import {
  CHANGED_TEST_PRODUCT_INPUT_DESCRIPTOR_ID,
  CHANGED_TEST_PRODUCT_INPUT_PATHS,
} from "@/commands/test/changed-set-planning";
import { digestDescriptorSection } from "@/config/descriptor-digest";
import { CONFIG_FILENAMES } from "@/config/index";
import type { GitDependencies } from "@/lib/git/root";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { PYTHON_PRODUCT_INPUT_PATH, pythonTestingLanguage } from "@/test/languages/python";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import {
  digestTestPaths,
  extractStalenessInputs,
  isStalenessMatch,
  readTestingRuns,
  selectLatestTerminalTestRunForNode,
  TEST_RUN_STATE_STATUS,
} from "@/test/run-state";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR_COUNTS,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { relatedDeps, stagedSnapshotGit } from "@testing/harnesses/testing/changed-set-planning-support";
import { invokedArgs, testingCommandDependencies } from "@testing/harnesses/testing/command-support";
import {
  withTestingTempProductDir,
  writeTestFileFixture,
  writeTestingConfig,
} from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

function recordedProductInputDigest(
  recorded: { readonly productInputDigests: readonly { readonly descriptorId: string; readonly digest: string }[] },
  descriptorId: string,
): string | undefined {
  return recorded.productInputDigests.find((digest) => digest.descriptorId === descriptorId)?.digest;
}

function expectedTestContentDigest(path: string, content: string): string {
  const digest = digestDescriptorSection([[path, content]]);
  if (!digest.ok) throw new Error(digest.error);
  return digest.value.sha256;
}

async function writeProductInputFile(productDir: string, path: string, content: string): Promise<void> {
  const absolutePath = join(productDir, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

async function expectProductInputDigestChanges({
  nodeFile,
  productInputPath,
  descriptorId,
}: {
  readonly nodeFile: string;
  readonly productInputPath: string;
  readonly descriptorId: string;
}): Promise<void> {
  await assertProperty(
    fc.uniqueArray(arbitraryDomainLiteral(), {
      minLength: LITERAL_TEST_GENERATOR_COUNTS.two,
      maxLength: LITERAL_TEST_GENERATOR_COUNTS.two,
    }),
    async ([firstInputContent, secondInputContent]) => {
      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);
        await writeProductInputFile(productDir, productInputPath, firstInputContent);

        const firstRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
        const first = await runTestsCommand({ productDir, passing: false }, testingCommandDependencies(firstRunner));
        const firstDigest = recordedProductInputDigest(first.recorded, descriptorId);
        expect(firstDigest).toBeDefined();

        await writeProductInputFile(productDir, productInputPath, secondInputContent);

        const secondRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
        const second = await runTestsCommand({ productDir, passing: false }, testingCommandDependencies(secondRunner));
        const secondDigest = recordedProductInputDigest(second.recorded, descriptorId);
        expect(secondDigest).toBeDefined();
        expect(secondDigest).not.toBe(firstDigest);
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

async function expectStagedProductInputDigestMatchesCurrent({
  nodeFile,
  productInputPath,
  descriptorId,
}: {
  readonly nodeFile: string;
  readonly productInputPath: string;
  readonly descriptorId: string;
}): Promise<void> {
  await assertProperty(
    fc.uniqueArray(arbitraryDomainLiteral(), {
      minLength: LITERAL_TEST_GENERATOR_COUNTS.two,
      maxLength: LITERAL_TEST_GENERATOR_COUNTS.two,
    }),
    async ([worktreeInputContent, stagedInputContent]) => {
      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);
        await writeProductInputFile(productDir, productInputPath, worktreeInputContent);

        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
        const recorded = await runTestsCommand(
          { productDir, passing: false, changed: { staged: true } },
          {
            registry: testingRegistry,
            runnerDepsFor: () => runner,
            relatedDepsFor: relatedDeps,
            git: stagedSnapshotGit({
              changedPaths: [nodeFile, productInputPath],
              stagedFiles: new Map([
                [nodeFile, (await readFile(join(productDir, nodeFile))).toString()],
                [productInputPath, stagedInputContent],
              ]),
            }),
          },
        );
        const stagedDigest = recordedProductInputDigest(recorded.recorded, descriptorId);
        expect(stagedDigest).toBeDefined();

        await writeProductInputFile(productDir, productInputPath, stagedInputContent);
        const currentInputs = await currentStalenessInputs(productDir, [nodeFile], { registry: testingRegistry });
        const currentDigest = recordedProductInputDigest(currentInputs, descriptorId);
        expect(stagedDigest).toBe(currentDigest);
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export function registerExecutionRecordingScenarioTests(): void {
  describe("spx test execution recording and per-node run", () => {
    it("filters a config-excluded node when `spx test passing` reads the passing scope from spx.config", async () => {
      const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const excludedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
      );
      const includedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, excludedFile);
        await writeTestFileFixture(productDir, includedFile);
        await writeTestingConfig(productDir, { exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNode}`] });

        await runTestsCommand({ productDir, passing: true }, testingCommandDependencies(runner));

        expect(invokedArgs(runner)).not.toContain(excludedFile);
        expect(invokedArgs(runner)).toContain(includedFile);
      });
    });

    it("runs a config-excluded node when `spx test` applies no passing scope", async () => {
      const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const excludedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
      );
      const includedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, excludedFile);
        await writeTestFileFixture(productDir, includedFile);
        await writeTestingConfig(productDir, { exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNode}`] });

        await runTestsCommand({ productDir, passing: false }, testingCommandDependencies(runner));

        expect(invokedArgs(runner)).toContain(excludedFile);
        expect(invokedArgs(runner)).toContain(includedFile);
      });
    });

    it("applies no exclusion when a passing-scope prefix is not a full product-root path", async () => {
      const [node, otherNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node));
      const otherFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, otherNode),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);
        await writeTestFileFixture(productDir, otherFile);
        // A bare node path carries no product-root prefix, so it matches no discovered path.
        await writeTestingConfig(productDir, { exclude: [node] });

        await runTestsCommand({ productDir, passing: true }, testingCommandDependencies(runner));

        expect(invokedArgs(runner)).toContain(nodeFile);
        expect(invokedArgs(runner)).toContain(otherFile);
      });
    });

    it("records last-run evidence covering the dispatched files when `spx test` runs", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);

        await runTestsCommand({ productDir, passing: false }, testingCommandDependencies(runner));

        const runs = await readTestingRuns(productDir);
        expect(runs.ok).toBe(true);
        if (runs.ok) {
          expect(runs.value.terminalRuns).toHaveLength(1);
          const run = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, [nodeFile]);
          expect(run).toBeDefined();
          expect(run?.state.discoveredTestPathsDigest).toBe(digestTestPaths([nodeFile]));
        }
      });
    });

    it("records descriptor-declared product input digests and changes them when those inputs change", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const [productInputPath] = typescriptTestingLanguage.productInputPaths;

      await expectProductInputDigestChanges({
        nodeFile,
        productInputPath,
        descriptorId: typescriptTestingLanguage.name,
      });
    });

    it("records descriptor-declared product input digests and changes them when missing inputs appear", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const [productInputPath] = typescriptTestingLanguage.productInputPaths;

      await assertProperty(
        arbitraryDomainLiteral(),
        async (productInputContent) => {
          await withTestingTempProductDir(async (productDir) => {
            await writeTestFileFixture(productDir, nodeFile);

            const missingInputRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
            const missingInputRun = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(missingInputRunner),
            );
            const missingInputDigest = recordedProductInputDigest(
              missingInputRun.recorded,
              typescriptTestingLanguage.name,
            );
            expect(missingInputDigest).toBeDefined();

            await writeFile(join(productDir, productInputPath), productInputContent);

            const presentInputRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
            const presentInputRun = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(presentInputRunner),
            );
            const presentInputDigest = recordedProductInputDigest(
              presentInputRun.recorded,
              typescriptTestingLanguage.name,
            );
            expect(presentInputDigest).toBeDefined();
            expect(presentInputDigest).not.toBe(missingInputDigest);
          });
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("records staged product input digests when staged changed-set planning runs", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const [productInputPath] = typescriptTestingLanguage.productInputPaths;

      await expectStagedProductInputDigestMatchesCurrent({
        nodeFile,
        productInputPath,
        descriptorId: typescriptTestingLanguage.name,
      });
    });

    it("rejects staged testing config read failures", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const failureMessage = sampleLiteralTestValue(arbitraryDomainLiteral());

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);
        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

        await expect(
          runTestsCommand(
            { productDir, passing: false, changed: { staged: true } },
            {
              registry: testingRegistry,
              runnerDepsFor: () => runner,
              relatedDepsFor: relatedDeps,
              git: stagedSnapshotGit({
                changedPaths: [nodeFile],
                stagedFiles: new Map([[nodeFile, (await readFile(join(productDir, nodeFile))).toString()]]),
                failedStagedFiles: new Map([[CONFIG_FILENAMES.json, failureMessage]]),
              }),
            },
          ),
        ).rejects.toThrow(failureMessage);
      });
    });

    it("records changed-set product input digests and changes them when those inputs change", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const [productInputPath] = CHANGED_TEST_PRODUCT_INPUT_PATHS;

      await expectProductInputDigestChanges({
        nodeFile,
        productInputPath,
        descriptorId: CHANGED_TEST_PRODUCT_INPUT_DESCRIPTOR_ID,
      });
    });

    it("records staged changed-set product input digests when staged changed-set planning runs", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const [productInputPath] = CHANGED_TEST_PRODUCT_INPUT_PATHS;

      await expectStagedProductInputDigestMatchesCurrent({
        nodeFile,
        productInputPath,
        descriptorId: CHANGED_TEST_PRODUCT_INPUT_DESCRIPTOR_ID,
      });
    });

    it("rejects staged product input read failures", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const [productInputPath] = CHANGED_TEST_PRODUCT_INPUT_PATHS;
      const failureMessage = sampleLiteralTestValue(arbitraryDomainLiteral());

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);
        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

        await expect(
          runTestsCommand(
            { productDir, passing: false, changed: { staged: true } },
            {
              registry: testingRegistry,
              runnerDepsFor: () => runner,
              relatedDepsFor: relatedDeps,
              git: stagedSnapshotGit({
                changedPaths: [nodeFile],
                stagedFiles: new Map([[nodeFile, (await readFile(join(productDir, nodeFile))).toString()]]),
                failedStagedFiles: new Map([[productInputPath, failureMessage]]),
              }),
            },
          ),
        ).rejects.toThrow(failureMessage);
      });
    });

    it("records Python product input digests and changes them when product-root conftest changes", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));

      await expectProductInputDigestChanges({
        nodeFile,
        productInputPath: PYTHON_PRODUCT_INPUT_PATH.CONFTEST,
        descriptorId: pythonTestingLanguage.name,
      });
    });

    it("records Python product input digests and changes them when a covered tests conftest changes", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
      const nestedConftestPath = join(dirname(nodeFile), PYTHON_PRODUCT_INPUT_PATH.CONFTEST);

      await expectProductInputDigestChanges({
        nodeFile,
        productInputPath: nestedConftestPath,
        descriptorId: pythonTestingLanguage.name,
      });
    });

    it("records discovered test content digests and changes them when covered files change", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));

      await assertProperty(
        fc.uniqueArray(arbitraryDomainLiteral(), {
          minLength: LITERAL_TEST_GENERATOR_COUNTS.two,
          maxLength: LITERAL_TEST_GENERATOR_COUNTS.two,
        }),
        async ([firstContent, secondContent]) => {
          await withTestingTempProductDir(async (productDir) => {
            await writeTestFileFixture(productDir, nodeFile);
            await writeFile(join(productDir, nodeFile), firstContent);

            const firstRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
            const first = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(firstRunner),
            );

            await writeFile(join(productDir, nodeFile), secondContent);

            const secondRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
            const second = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(secondRunner),
            );

            expect(first.recorded.discoveredTestContentDigest).toBe(
              expectedTestContentDigest(nodeFile, firstContent),
            );
            expect(second.recorded.discoveredTestContentDigest).toBe(
              expectedTestContentDigest(nodeFile, secondContent),
            );
            expect(second.recorded.discoveredTestContentDigest).not.toBe(first.recorded.discoveredTestContentDigest);

            const currentInputs = await currentStalenessInputs(productDir, [nodeFile], { registry: testingRegistry });
            expect(isStalenessMatch(extractStalenessInputs(first.recorded), currentInputs)).toBe(false);
            expect(isStalenessMatch(extractStalenessInputs(second.recorded), currentInputs)).toBe(true);
          });
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });

    it("executes a single node's tests through the registry and records fresh evidence", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);

        const { dispatch, recorded } = await runNodeCommand(
          { productDir, nodePath: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}` },
          testingCommandDependencies(runner),
        );

        expect(invokedArgs(runner)).toContain(nodeFile);
        expect(dispatch.exitCode).toBe(0);
        expect(recorded.status).toBe(TEST_RUN_STATE_STATUS.PASSED);

        const runs = await readTestingRuns(productDir);
        expect(runs.ok).toBe(true);
        if (runs.ok) {
          expect(selectLatestTerminalTestRunForNode(runs.value.terminalRuns, [nodeFile])).toBeDefined();
        }
      });
    });

    it("propagates a runner failure through the per-node run's result and recorded status", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
      const runner = createRecordingCommandRunner({ present: true, exitCode: failingExitCode });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);

        const { dispatch, recorded } = await runNodeCommand(
          { productDir, nodePath: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}` },
          testingCommandDependencies(runner),
        );

        // The runner's non-zero exit propagates to the returned result and the
        // recorded status the resolver reads.
        expect(dispatch.exitCode).toBe(failingExitCode);
        expect(recorded.status).toBe(TEST_RUN_STATE_STATUS.FAILED);
      });
    });

    it("scopes a per-node run's recorded evidence to the node, leaving sibling-node files out", async () => {
      const [targetNode, siblingNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const targetFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, targetNode),
      );
      const siblingFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, siblingNode),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, targetFile);
        await writeTestFileFixture(productDir, siblingFile);

        const { recorded } = await runNodeCommand(
          { productDir, nodePath: `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${targetNode}` },
          testingCommandDependencies(runner),
        );

        // The sibling file is present in the tree but neither runs nor enters the
        // recorded evidence — the per-node digest covers only the target's files.
        expect(invokedArgs(runner)).not.toContain(siblingFile);
        expect(recorded.discoveredTestPathsDigest).toBe(digestTestPaths([targetFile]));

        const runs = await readTestingRuns(productDir);
        expect(runs.ok).toBe(true);
        if (runs.ok) {
          expect(selectLatestTerminalTestRunForNode(runs.value.terminalRuns, [targetFile])).toBeDefined();
          expect(selectLatestTerminalTestRunForNode(runs.value.terminalRuns, [siblingFile])).toBeUndefined();
        }
      });
    });

    it("records a readable terminal run when git identity is unavailable", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodeFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      // Git resolution fails (no repo / detached HEAD / no commits): every git call exits non-zero.
      const unavailableGit: GitDependencies = {
        execa: async () => ({ exitCode: 1, stdout: "", stderr: "" }),
      };

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, nodeFile);

        const { recorded } = await runTestsCommand(
          { productDir, passing: false },
          { registry: testingRegistry, runnerDepsFor: () => runner, git: unavailableGit },
        );

        // The recorded identity is the non-empty sentinel, so the state round-trips as
        // a terminal run rather than being rejected as a malformed (incomplete) run.
        expect(recorded.branchName).toBe(NO_GIT_IDENTITY);
        expect(recorded.headSha).toBe(NO_GIT_IDENTITY);

        const runs = await readTestingRuns(productDir);
        expect(runs.ok).toBe(true);
        if (runs.ok) {
          expect(runs.value.terminalRuns).toHaveLength(1);
          expect(runs.value.incompleteRuns).toHaveLength(0);
          expect(selectLatestTerminalTestRunForNode(runs.value.terminalRuns, [nodeFile])).toBeDefined();
        }
      });
    });
  });
}

export const executionRecordingScenarioCases = collectHarnessTestCases(registerExecutionRecordingScenarioTests);
