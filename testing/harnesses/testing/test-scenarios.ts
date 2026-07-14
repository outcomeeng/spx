import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

import {
  CHANGED_TEST_RELATED_DEPS_ERROR,
  CHANGED_TEST_STAGED_DIRTY_WORKTREE_ERROR,
  type RecordedTestRun,
  runTests,
  runTestsCommand,
  type TestDispatchResult,
} from "@/commands/test";
import { CONFIG_FILENAMES } from "@/config/index";
import { PATH_FILTER_CONFIG_FIELDS } from "@/config/primitives/path-filter";
import {
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
  UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
} from "@/domains/test";
import { TESTING_CLI } from "@/interfaces/cli/test";
import type { GitDependencies } from "@/lib/git/root";
import { SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION } from "@/test/config";
import { pythonTestingLanguage } from "@/test/languages/python";
import type { TestingLanguageDescriptor } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { TEST_RUN_STATE_FIELDS, TEST_RUN_STATE_STATUS } from "@/test/run-state";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { CHANGED_SET_PLANNING_GENERATOR } from "@testing/generators/testing/changed-set-planning";
import {
  nodeOperand,
  sampleDispatchValue,
  specFileUnder,
  TEST_DISPATCH_GENERATOR,
} from "@testing/generators/testing/dispatch";
import { GIT_TEST_REF } from "@testing/harnesses/git-test-constants";
import { relatedDeps, stagedSnapshotGit } from "@testing/harnesses/testing/changed-set-planning-support";
import { runTestingCli, type TestingCliCall, testingCliDeps } from "@testing/harnesses/testing/cli";
import { invokedArgs } from "@testing/harnesses/testing/command-support";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

const changedSetContent = CHANGED_SET_PLANNING_GENERATOR.content();
const EMPTY_TESTING_CONFIG = `${TESTING_SECTION}: {}\n`;

type TestCommandRequest = Parameters<typeof runTestsCommand>[0];
type TestCommandDependencies = Parameters<typeof runTestsCommand>[1];

function recordedPassingRun(productDir: string, run: TestDispatchResult): RecordedTestRun {
  return {
    dispatch: run,
    runFile: {
      runsDir: productDir,
      runFilePath: productDir,
      runFileName: productDir,
      runToken: productDir,
      runId: productDir,
      startedAt: productDir,
    },
    recorded: {
      branchName: productDir,
      headSha: productDir,
      testingConfigDigest: productDir,
      runnerOutcomes: [],
      discoveredTestPathsDigest: productDir,
      discoveredTestContentDigest: productDir,
      productInputDigests: [],
      startedAt: productDir,
      completedAt: productDir,
      [TEST_RUN_STATE_FIELDS.STATUS]: TEST_RUN_STATE_STATUS.PASSED,
    },
  };
}

function stagedConfigChangeGit(
  headSha: string,
  stagedConfig: string,
  changedPath: string = CONFIG_FILENAMES.yaml,
  dirtyWorktreePaths: readonly string[] = [],
  untrackedWorktreePaths: readonly string[] = [],
): GitDependencies {
  return stagedSnapshotGit({
    changedPaths: [changedPath],
    stagedFiles: new Map([[changedPath, stagedConfig]]),
    dirtyWorktreePaths,
    untrackedWorktreePaths,
    trackedStagedPaths: changedPath.includes(`/${SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME}/`) ? [changedPath] : [],
    resolvedHeadSha: headSha,
  });
}

function rejectIfChangedSetPlanningStartsGit(): GitDependencies {
  return {
    execa: () => {
      throw new Error("changed-set planning started before dependency validation");
    },
  };
}

function stagedChangedCommandDeps(
  runner: ReturnType<typeof createRecordingCommandRunner>,
  git: GitDependencies,
): TestCommandDependencies {
  return {
    registry: testingRegistry,
    runnerDepsFor: () => runner,
    relatedDepsFor: relatedDeps,
    git,
  };
}

async function runStagedChangedTestCommand(
  request: Omit<TestCommandRequest, "changed">,
  runner: ReturnType<typeof createRecordingCommandRunner>,
  git: GitDependencies,
): Promise<Awaited<ReturnType<typeof runTestsCommand>>> {
  return await runTestsCommand(
    {
      ...request,
      changed: { baseRef: GIT_TEST_REF.HEAD_NAME, staged: true },
    },
    stagedChangedCommandDeps(runner, git),
  );
}

async function expectStagedDirtySelectionRejection({
  runner,
  headSha,
  stagedTestingConfig = EMPTY_TESTING_CONFIG,
  changedPath,
  dirtyWorktreePaths,
  untrackedWorktreePaths = [],
  targets,
  fixturePaths,
}: {
  readonly runner: ReturnType<typeof createRecordingCommandRunner>;
  readonly headSha: string;
  readonly stagedTestingConfig?: string;
  readonly changedPath: string;
  readonly dirtyWorktreePaths: readonly string[];
  readonly untrackedWorktreePaths?: readonly string[];
  readonly targets?: NonNullable<TestCommandRequest["targets"]>;
  readonly fixturePaths: readonly string[];
}): Promise<void> {
  await withTestingTempProductDir(async (productDir) => {
    await Promise.all(fixturePaths.map((path) => writeTestFileFixture(productDir, path)));

    await expect(
      runStagedChangedTestCommand(
        {
          productDir,
          passing: false,
          ...(targets === undefined ? {} : { targets }),
        },
        runner,
        stagedConfigChangeGit(
          headSha,
          stagedTestingConfig,
          changedPath,
          dirtyWorktreePaths,
          untrackedWorktreePaths,
        ),
      ),
    ).rejects.toThrow(CHANGED_TEST_STAGED_DIRTY_WORKTREE_ERROR);

    expect(invokedArgs(runner)).toEqual([]);
  });
}

export function registerTestScenarioTests(): void {
  describe("spx test dispatch over the language registry", () => {
    it("invokes each language's runner on the files matching its registered extension", async () => {
      const [tsNode, pyNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const tsFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, tsNode));
      const pyFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, pyNode));
      const tsRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      const pyRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, tsFile);
        await writeTestFileFixture(productDir, pyFile);

        await runTests({ productDir, registry: testingRegistry }, {
          runnerDepsFor: (language: TestingLanguageDescriptor) =>
            language === typescriptTestingLanguage ? tsRunner : pyRunner,
        });

        expect(invokedArgs(tsRunner)).toContain(tsFile);
        expect(invokedArgs(tsRunner)).not.toContain(pyFile);
        expect(invokedArgs(pyRunner)).toContain(pyFile);
        expect(invokedArgs(pyRunner)).not.toContain(tsFile);
      });
    });

    it("reports, skips, and fails test files matching no registered runner", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const matchedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const unmatchedFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.unmatchedTestFileUnder(nodePath));
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, matchedFile);
        await writeTestFileFixture(productDir, unmatchedFile);

        const result = await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => runner });

        expect(result.exitCode).toBe(UNSUPPORTED_TEST_SELECTION_EXIT_CODE);
        expect(result.unmatched).toContain(unmatchedFile);
        expect(invokedArgs(runner)).not.toContain(unmatchedFile);
      });
    });

    it("reports a co-located non-test source file as unmatched and fails", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const supportFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.supportFileUnder(typescriptTestingLanguage, nodePath),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testFile);
        await writeTestFileFixture(productDir, supportFile);

        const result = await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => runner });

        expect(result.unmatched).toContain(supportFile);
        expect(result.exitCode).toBe(UNSUPPORTED_TEST_SELECTION_EXIT_CODE);
        expect(invokedArgs(runner)).toContain(testFile);
        expect(invokedArgs(runner)).not.toContain(supportFile);
      });
    });

    it("exits non-zero when any dispatched runner exits non-zero", async () => {
      const [tsNode, pyNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const tsFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, tsNode));
      const pyFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, pyNode));
      const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
      const passingRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      const failingRunner = createRecordingCommandRunner({ present: true, exitCode: failingExitCode });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, tsFile);
        await writeTestFileFixture(productDir, pyFile);

        const result = await runTests({ productDir, registry: testingRegistry }, {
          runnerDepsFor: (language: TestingLanguageDescriptor) =>
            language === typescriptTestingLanguage ? passingRunner : failingRunner,
        });

        expect(result.exitCode).not.toBe(0);
      });
    });

    it("skips an absent language's runner and aggregates from the present ones", async () => {
      const [presentNode, absentNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const presentFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, presentNode),
      );
      const absentFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, absentNode));
      const absentExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
      const presentRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      const absentRunner = createRecordingCommandRunner({ present: false, exitCode: absentExitCode });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, presentFile);
        await writeTestFileFixture(productDir, absentFile);

        const result = await runTests({ productDir, registry: testingRegistry }, {
          runnerDepsFor: (language: TestingLanguageDescriptor) =>
            language === typescriptTestingLanguage ? presentRunner : absentRunner,
        });

        // The absent language's runner is gated out — never invoked — so its
        // configured non-zero exit code cannot leak into the aggregate.
        expect(absentRunner.calls).toHaveLength(0);
        expect(invokedArgs(presentRunner)).toContain(presentFile);
        expect(result.exitCode).toBe(0);
      });
    });

    it("reports unresolved changed source files without failing a passing run", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const unresolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testFile);

        const result = await runTests(
          {
            productDir,
            registry: testingRegistry,
            targets: { operands: [testFile], recursive: false },
            unresolvedChangedSourceFiles: [unresolvedSourcePath],
          },
          { runnerDepsFor: () => runner },
        );

        expect(result.exitCode).toBe(SUCCESS_EXIT_CODE);
        expect(result.unresolvedChangedSourceFiles).toEqual([unresolvedSourcePath]);
        expect(invokedArgs(runner)).toContain(testFile);
      });
    });

    it("does not report unresolved changed source files when product inputs select the full tree", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const unresolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const run = await runTestsCommand(
          {
            productDir,
            passing: false,
            changed: { baseRef: GIT_TEST_REF.HEAD_NAME },
          },
          {
            registry: testingRegistry,
            runnerDepsFor: () => runner,
            relatedDepsFor: relatedDeps,
            git: stagedConfigChangeGit(
              headSha,
              changedSetContent.emptyTsconfig,
              CONFIG_FILENAMES.yaml,
              [CONFIG_FILENAMES.yaml, unresolvedSourcePath],
            ),
          },
        );

        expect(run.dispatch.exitCode).toBe(SUCCESS_EXIT_CODE);
        expect(run.dispatch.unresolvedChangedSourceFiles).toEqual([]);
        expect(invokedArgs(runner)).toContain(testPath);
      });
    });

    it("passes staged changed selection through the CLI", async () => {
      const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const baseRef = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const agentCalls: TestingCliCall[] = [];
      const streamCalls: TestingCliCall[] = [];
      const run = recordedPassingRun(productDir, {
        exitCode: SUCCESS_EXIT_CODE,
        groups: [],
        unmatched: [],
        unresolvedTargets: [],
        reports: [],
        outcomes: [],
      });

      const result = await runTestingCli([
        TESTING_CLI.commandName,
        TESTING_CLI.changedLongFlag,
        TESTING_CLI.stagedLongFlag,
        TESTING_CLI.baseLongFlag,
        baseRef,
      ], testingCliDeps(productDir, run, agentCalls, streamCalls));

      expect(agentCalls).toEqual([]);
      expect(streamCalls).toEqual([{ productDir, passing: false, changed: { baseRef, staged: true } }]);
      expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
    });

    it("reads staged config snapshots when staged changed selection runs", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const malformedTestingConfig = sampleLiteralTestValue(arbitraryDomainLiteral());
      const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const excludedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
      );
      const includedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
      );
      const stagedTestingConfig = JSON.stringify({
        [TESTING_SECTION]: {
          [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: {
            [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNode}`],
          },
        },
      });

      await withTestingTempProductDir(async (productDir) => {
        await writeFile(join(productDir, CONFIG_FILENAMES.json), malformedTestingConfig);
        await writeTestFileFixture(productDir, excludedTestPath);
        await writeTestFileFixture(productDir, includedTestPath);

        const run = await runTestsCommand(
          {
            productDir,
            passing: true,
            changed: { baseRef: GIT_TEST_REF.HEAD_NAME, staged: true },
          },
          {
            registry: testingRegistry,
            runnerDepsFor: () => runner,
            relatedDepsFor: relatedDeps,
            git: stagedConfigChangeGit(headSha, stagedTestingConfig, CONFIG_FILENAMES.json),
          },
        );

        expect(run.dispatch.exitCode).toBe(SUCCESS_EXIT_CODE);
        expect(invokedArgs(runner)).not.toContain(excludedTestPath);
        expect(invokedArgs(runner)).toContain(includedTestPath);
      });
    });

    it("allows staged passing changed selection when a dirty test file is excluded by staged passing scope", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const excludedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
      );
      const includedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
      );
      const stagedTestingConfig = JSON.stringify({
        [TESTING_SECTION]: {
          [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: {
            [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNode}`],
          },
        },
      });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, excludedTestPath);
        await writeTestFileFixture(productDir, includedTestPath);

        const run = await runStagedChangedTestCommand(
          {
            productDir,
            passing: true,
          },
          runner,
          stagedConfigChangeGit(headSha, stagedTestingConfig, CONFIG_FILENAMES.json, [excludedTestPath]),
        );

        expect(run.dispatch.exitCode).toBe(SUCCESS_EXIT_CODE);
        expect(invokedArgs(runner)).not.toContain(excludedTestPath);
        expect(invokedArgs(runner)).toContain(includedTestPath);
      });
    });

    it("rejects staged changed selection when a staged path has unstaged tracked changes", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: testPath,
        dirtyWorktreePaths: [testPath],
        fixturePaths: [testPath],
      });
    });

    it("rejects staged node selection when the node spec file has unstaged tracked changes", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const specPath = specFileUnder(nodePath);

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: testPath,
        dirtyWorktreePaths: [specPath],
        targets: { operands: [nodeOperand(nodePath)], recursive: false },
        fixturePaths: [testPath, specPath],
      });
    });

    it("rejects staged path-selected changed sets when an untracked node test input is dirty", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const untrackedPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.supportFileUnder(typescriptTestingLanguage, nodePath),
      );

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: testPath,
        dirtyWorktreePaths: [],
        untrackedWorktreePaths: [untrackedPath],
        fixturePaths: [testPath],
      });
    });

    it("runs staged changed selection when unrelated worktree paths are dirty", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const dirtyPath = sampleLiteralTestValue(arbitrarySourceFilePath());

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const run = await runStagedChangedTestCommand(
          {
            productDir,
            passing: false,
          },
          runner,
          stagedConfigChangeGit(headSha, EMPTY_TESTING_CONFIG, testPath, [dirtyPath]),
        );

        expect(run.dispatch.exitCode).toBe(SUCCESS_EXIT_CODE);
        expect(invokedArgs(runner)).toContain(testPath);
      });
    });

    it("rejects staged product-input selection when a spec-tree test file is dirty", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const dirtyPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: CONFIG_FILENAMES.yaml,
        dirtyWorktreePaths: [dirtyPath],
        fixturePaths: [testPath],
      });
    });

    it("runs staged product-input selection when unrelated source files are dirty", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const dirtyPath = sampleLiteralTestValue(arbitrarySourceFilePath());

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const run = await runStagedChangedTestCommand(
          {
            productDir,
            passing: false,
          },
          runner,
          stagedConfigChangeGit(headSha, EMPTY_TESTING_CONFIG, CONFIG_FILENAMES.yaml, [dirtyPath]),
        );

        expect(run.dispatch.exitCode).toBe(SUCCESS_EXIT_CODE);
        expect(invokedArgs(runner)).toContain(testPath);
      });
    });

    it("rejects staged changed selection when an explicit target has dirty test files", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const [changedNodePath, explicitNodePath] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const changedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, changedNodePath),
      );
      const explicitTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, explicitNodePath),
      );

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: changedTestPath,
        dirtyWorktreePaths: [explicitTestPath],
        targets: { operands: [nodeOperand(explicitNodePath)], recursive: false },
        fixturePaths: [changedTestPath, explicitTestPath],
      });
    });

    it("rejects staged changed selection when a trailing-slash explicit target has dirty test files", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const [changedNodePath, explicitNodePath] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const changedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, changedNodePath),
      );
      const explicitTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, explicitNodePath),
      );

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: changedTestPath,
        dirtyWorktreePaths: [explicitTestPath],
        targets: { operands: [`${nodeOperand(explicitNodePath)}/`], recursive: false },
        fixturePaths: [changedTestPath, explicitTestPath],
      });
    });

    it("rejects staged changed selection when a current-directory explicit target has dirty test files", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const [changedNodePath, explicitNodePath] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const changedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, changedNodePath),
      );
      const explicitTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, explicitNodePath),
      );
      const explicitOperand = [".", nodeOperand(explicitNodePath)].join("/");

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: changedTestPath,
        dirtyWorktreePaths: [explicitTestPath],
        targets: { operands: [explicitOperand], recursive: false },
        fixturePaths: [changedTestPath, explicitTestPath],
      });
    });

    it("rejects staged changed selection when a product-directory explicit target has dirty test files", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: CONFIG_FILENAMES.yaml,
        dirtyWorktreePaths: [testPath],
        targets: { operands: ["."], recursive: false },
        fixturePaths: [testPath],
      });
    });

    it("rejects staged changed selection when a backslash explicit target has dirty test files", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const [changedNodePath, explicitNodePath] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const changedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, changedNodePath),
      );
      const explicitTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, explicitNodePath),
      );
      const explicitOperand = nodeOperand(explicitNodePath).replaceAll("/", "\\");

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: changedTestPath,
        dirtyWorktreePaths: [explicitTestPath],
        targets: { operands: [explicitOperand], recursive: false },
        fixturePaths: [changedTestPath, explicitTestPath],
      });
    });

    it("rejects staged changed selection when a recursive explicit target has dirty descendant test files", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const [parentNodePath, descendantNodePath] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodeWithDescendant());
      const changedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, parentNodePath),
      );
      const dirtyDescendantTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, descendantNodePath),
      );

      await expectStagedDirtySelectionRejection({
        runner,
        headSha,
        changedPath: changedTestPath,
        dirtyWorktreePaths: [dirtyDescendantTestPath],
        targets: { operands: [nodeOperand(parentNodePath)], recursive: true },
        fixturePaths: [changedTestPath, dirtyDescendantTestPath],
      });
    });

    it("runs path-selected changed sets with related-test dependencies", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
      const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const run = await runTestsCommand(
          {
            productDir,
            passing: false,
            changed: { baseRef: GIT_TEST_REF.HEAD_NAME, staged: true },
          },
          {
            registry: testingRegistry,
            runnerDepsFor: () => runner,
            relatedDepsFor: relatedDeps,
            git: stagedConfigChangeGit(headSha, EMPTY_TESTING_CONFIG, testPath),
          },
        );

        expect(run.dispatch.exitCode).toBe(SUCCESS_EXIT_CODE);
        expect(invokedArgs(runner)).toContain(testPath);
      });
    });

    it("rejects missing related-test dependencies before changed-set planning starts", async () => {
      const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });

      await withTestingTempProductDir(async (productDir) => {
        await expect(
          runTestsCommand(
            {
              productDir,
              passing: false,
              changed: { baseRef: GIT_TEST_REF.HEAD_NAME, staged: true },
            },
            {
              registry: testingRegistry,
              runnerDepsFor: () => runner,
              git: rejectIfChangedSetPlanningStartsGit(),
            },
          ),
        ).rejects.toThrow(CHANGED_TEST_RELATED_DEPS_ERROR);
      });
    });

    it("prints unresolved changed source warnings without failing a passing CLI run", async () => {
      const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const unresolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
      const agentCalls: TestingCliCall[] = [];
      const streamCalls: TestingCliCall[] = [];
      const run = recordedPassingRun(productDir, {
        exitCode: SUCCESS_EXIT_CODE,
        groups: [],
        unmatched: [],
        unresolvedTargets: [],
        unresolvedChangedSourceFiles: [unresolvedSourcePath],
        reports: [],
        outcomes: [],
      });

      const result = await runTestingCli([
        TESTING_CLI.commandName,
      ], testingCliDeps(productDir, run, agentCalls, streamCalls));

      expect(result.stderr).toContain(unresolvedSourcePath);
      expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
    });

    it("reports absent selected runner groups for passing operator-mode runs", async () => {
      const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const reportedPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const gatedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
      const agentCalls: TestingCliCall[] = [];
      const streamCalls: TestingCliCall[] = [];
      const run = recordedPassingRun(productDir, {
        exitCode: SUCCESS_EXIT_CODE,
        groups: [{
          language: typescriptTestingLanguage,
          testPaths: [reportedPath],
        }, {
          language: pythonTestingLanguage,
          testPaths: [gatedPath],
        }],
        unmatched: [],
        unresolvedTargets: [],
        reports: [{
          runnerId: typescriptTestingLanguage.name,
          testPaths: [reportedPath],
          exitCode: SUCCESS_EXIT_CODE,
        }],
        outcomes: [],
      });

      const result = await runTestingCli([
        TESTING_CLI.commandName,
        TESTING_CLI.passingSubcommand,
      ], testingCliDeps(productDir, run, agentCalls, streamCalls));

      expect(agentCalls).toEqual([]);
      expect(streamCalls).toEqual([{ productDir, passing: true }]);
      expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
      expect(result.stderr).toContain(pythonTestingLanguage.name);
      expect(result.stderr).toContain(gatedPath);
      expect(result.stderr).not.toContain(reportedPath);
    });

    it("reports absent selected runner groups for failing operator-mode runs", async () => {
      const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const selectedPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const agentCalls: TestingCliCall[] = [];
      const streamCalls: TestingCliCall[] = [];
      const run = recordedPassingRun(productDir, {
        exitCode: NO_RUNNER_INVOCATION_EXIT_CODE,
        groups: [{
          language: typescriptTestingLanguage,
          testPaths: [selectedPath],
        }],
        unmatched: [],
        unresolvedTargets: [],
        reports: [],
        outcomes: [],
      });

      const result = await runTestingCli([
        TESTING_CLI.commandName,
        TESTING_CLI.passingSubcommand,
      ], testingCliDeps(productDir, run, agentCalls, streamCalls));

      expect(agentCalls).toEqual([]);
      expect(streamCalls).toEqual([{ productDir, passing: true }]);
      expect(result.exitCodes).toEqual([NO_RUNNER_INVOCATION_EXIT_CODE]);
      expect(result.stderr).toContain(typescriptTestingLanguage.name);
      expect(result.stderr).toContain(selectedPath);
    });

    it("fails when every selected language runner is absent", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const selectedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const absentExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
      const absentRunner = createRecordingCommandRunner({ present: false, exitCode: absentExitCode });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, selectedFile);

        const result = await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => absentRunner });

        expect(absentRunner.calls).toHaveLength(0);
        expect(result.exitCode).toBe(NO_RUNNER_INVOCATION_EXIT_CODE);
      });
    });

    it("filters a passing-scope-excluded node's files before runner invocation", async () => {
      const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
      const excludedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
      );
      const includedFile = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
      const passingScope = { exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNode}`] };

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, excludedFile);
        await writeTestFileFixture(productDir, includedFile);

        await runTests({ productDir, registry: testingRegistry, passingScope }, { runnerDepsFor: () => runner });

        expect(invokedArgs(runner)).not.toContain(excludedFile);
        expect(invokedArgs(runner)).toContain(includedFile);
      });
    });

    it("runs a would-be-excluded node's files when no passing scope is applied", async () => {
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

        await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => runner });

        expect(invokedArgs(runner)).toContain(excludedFile);
        expect(invokedArgs(runner)).toContain(includedFile);
      });
    });
  });
}

export const testScenarioCases = collectHarnessTestCases(registerTestScenarioTests);
