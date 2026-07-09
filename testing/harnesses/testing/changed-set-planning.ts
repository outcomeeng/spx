import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { execa } from "execa";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CHANGED_TEST_DIFF_CACHED_FLAG,
  CHANGED_TEST_DIFF_COMMAND,
  CHANGED_TEST_DIFF_NAME_STATUS_FLAG,
  CHANGED_TEST_INDEX_PATH_PREFIX,
  CHANGED_TEST_LS_FILES_COMMAND,
  CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG,
  CHANGED_TEST_LS_FILES_OTHERS_FLAG,
  CHANGED_TEST_NULL_DELIMITED_FLAG,
  CHANGED_TEST_PRODUCT_INPUT_PATHS,
  CHANGED_TEST_SHOW_COMMAND,
  changedPathsFromNameStatus,
  EMPTY_TREE_SHA,
  planChangedTestSelection,
} from "@/commands/test/changed-set-planning";
import { CONFIG_FILENAMES } from "@/config/index";
import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { mergeChangedSetOperands, partitionChangedPaths } from "@/domains/test/changed-set-planning";
import { type ExecResult, GIT_ROOT_COMMAND, type GitDependencies } from "@/git/root";
import { SOURCE_CLI_INVOCATION } from "@/interfaces/cli/invocation";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";
import { GIT_DELETE_STATUS_EXAMPLE, GIT_RENAME_STATUS_EXAMPLE, GIT_RENAMED_PATH_SUFFIX } from "@/lib/git/name-status";
import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { compareAsciiStrings } from "@/lib/state-store";
import type {
  RelatedTestDependencies,
  RelatedTestRequest,
  TestingLanguageDescriptor,
  TestRunInvocation,
  TestRunRequest,
} from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import type { TestingRegistry } from "@/test/registry";
import type { TestRunState } from "@/test/run-state";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import {
  CHANGED_SET_PLANNING_GENERATOR,
  changedSetImportStatement,
  changedSetSourceFixture,
  sampleChangedSetPlanningValue,
  tsconfigWithPaths,
} from "@testing/generators/testing/changed-set-planning";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  GIT_TEST_COMMAND,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
} from "@testing/harnesses/git-test-constants";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";

const defaultBranchName = sampleLiteralTestValue(arbitraryDomainLiteral());
const defaultBaseRef = [GIT_ROOT_COMMAND.ORIGIN, defaultBranchName].join("/");
const defaultBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
const explicitBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());

export const changedSetContent = CHANGED_SET_PLANNING_GENERATOR.content();

export interface GitCall {
  readonly command: string;
  readonly args: readonly string[];
}

export interface RecordingGitRunner {
  readonly calls: readonly GitCall[];
  readonly git: GitDependencies;
}

interface RecordingGitRunnerOptions {
  readonly resolveRefs?: boolean;
  readonly fallbackStdout?: string;
}

interface ChangedSetPlanHarnessRequest {
  readonly productDir?: string;
  readonly staged?: boolean;
  readonly baseRef?: string;
}

type GitRoute = (args: readonly string[]) => ExecResult | undefined;

export function changedSetDefaultBranchName(): string {
  return defaultBranchName;
}

export function changedSetDefaultBaseRef(): string {
  return defaultBaseRef;
}

export function nativeStringOrder(paths: readonly string[]): readonly string[] {
  return [...paths].sort(compareAsciiStrings);
}

export function specFileUnder(nodePath: string, suffix: string): string {
  return `${nodeOperand(nodePath)}/${nodeSpecSlug(nodePath, suffix)}.md`;
}

export function recordingGitRunner(
  changedPaths: readonly string[],
  untrackedPaths: readonly string[] = [],
): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      const stdout = args.includes(CHANGED_TEST_DIFF_NAME_STATUS_FLAG)
        ? nameStatusNulDelimited(changedPaths)
        : nulDelimited(changedPaths);
      return gitSuccess(stdout);
    }
    if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
      return gitSuccess(nulDelimited(untrackedPaths));
    }
    return undefined;
  });
}

export function renameGitRunner(oldPath: string, newPath: string): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      return gitSuccess(`${GIT_RENAME_STATUS_EXAMPLE}\0${oldPath}\0${newPath}\0`);
    }
    if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
      return gitSuccess();
    }
    return undefined;
  });
}

export function unbornHeadGitRunner(changedPaths: readonly string[]): RecordingGitRunner {
  return createRecordingGitRunner(
    (args) => {
      if (args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
        return gitFailure("unknown revision");
      }
      if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
        return gitSuccess(nameStatusNulDelimited(changedPaths));
      }
      return gitSuccess();
    },
    { resolveRefs: false, fallbackStdout: "" },
  );
}

export function stagedSourceGitRunner(
  sourcePath: string,
  testPath: string,
  testContent: string,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return stagedCandidateGitRunner([sourcePath], new Map([[testPath, testContent]]), tsconfigContent);
}

export function stagedMissingCandidateGitRunner(
  sourcePath: string,
  testPath: string,
  missingStderr: string,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      return gitSuccess(nameStatusNulDelimited([sourcePath]));
    }
    if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
      return gitSuccess(nulDelimited([testPath]));
    }
    if (args.includes(CHANGED_TEST_SHOW_COMMAND)) {
      const path = indexPathFromShowArgs(args);
      return path === TYPESCRIPT_MARKER ? gitSuccess(tsconfigContent) : gitFailure(missingStderr);
    }
    return undefined;
  });
}

export function stagedSourceCandidatesGitRunner(
  sourcePaths: readonly string[],
  candidateContents: ReadonlyMap<string, string>,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return stagedCandidateGitRunner(sourcePaths, candidateContents, tsconfigContent);
}

function createRecordingGitRunner(route: GitRoute, options: RecordingGitRunnerOptions = {}): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        const refResolution = (options.resolveRefs ?? true) ? resolveGitRef(args) : undefined;
        if (refResolution !== undefined) {
          return refResolution;
        }
        return route(args) ?? gitSuccess(options.fallbackStdout ?? headSha);
      },
    },
  };
}

function stagedCandidateGitRunner(
  sourcePaths: readonly string[],
  candidateContents: ReadonlyMap<string, string>,
  tsconfigContent: string,
): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      return gitSuccess(nameStatusNulDelimited(sourcePaths));
    }
    if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
      return gitSuccess(nulDelimited([...candidateContents.keys()]));
    }
    if (args.includes(CHANGED_TEST_SHOW_COMMAND)) {
      const path = indexPathFromShowArgs(args);
      return gitSuccess(path === TYPESCRIPT_MARKER ? tsconfigContent : candidateContents.get(path) ?? "");
    }
    return undefined;
  });
}

function resolveGitRef(args: readonly string[]): ExecResult | undefined {
  if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
    return gitSuccess(defaultBaseRef);
  }
  const lastArg = args.at(-1);
  if (lastArg === defaultBaseRef) {
    return gitSuccess(defaultBaseSha);
  }
  if (lastArg !== undefined && lastArg !== headSha && args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
    return gitSuccess(explicitBaseSha);
  }
  return undefined;
}

function indexPathFromShowArgs(args: readonly string[]): string {
  return args.find((arg) => arg.startsWith(CHANGED_TEST_INDEX_PATH_PREFIX))?.slice(1) ?? "";
}

function gitSuccess(stdout: string = ""): ExecResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function gitFailure(stderr: string): ExecResult {
  return { exitCode: 1, stdout: "", stderr };
}

export function descriptorWithRelatedTests(
  testPaths: readonly string[],
  resolvedSourcePaths: readonly string[],
): TestingLanguageDescriptor {
  return {
    ...typescriptTestingLanguage,
    relatedTestPaths: (request: RelatedTestRequest) => {
      const selectedTestPaths = testPaths.filter((testPath) => request.candidateTestPaths.includes(testPath));
      return Promise.resolve({
        testPaths: selectedTestPaths,
        resolvedSourcePaths: selectedTestPaths.length > 0 ? resolvedSourcePaths : [],
      });
    },
  };
}

export function descriptorWithoutRelatedTests(): TestingLanguageDescriptor {
  return {
    ...typescriptTestingLanguage,
    relatedTestPaths: undefined,
  };
}

export function registry(languages: readonly TestingLanguageDescriptor[]): TestingRegistry {
  return { languages };
}

export function relatedDeps(): RelatedTestDependencies {
  return {
    isLanguagePresent: () => true,
    runCommand: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: (path) => Promise.resolve(path === TYPESCRIPT_MARKER ? changedSetContent.emptyTsconfig : ""),
  };
}

export async function noRunTests(_request: TestRunRequest): Promise<TestRunInvocation> {
  return { invoked: false };
}

export async function assertChangedAliasSourceRootsRouteThroughRelatedTests(): Promise<void> {
  for (const fixture of sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixtureSet())) {
    const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
    await expectStagedTypeScriptPlan(
      stagedSourceGitRunner(
        fixture.sourcePath,
        paths.testPath,
        changedSetImportStatement(fixture.importSpecifier),
        tsconfigWithPaths(fixture.tsconfigPaths),
      ),
      [paths.testPath],
    );
  }
}

export async function assertChangedSetPlanningCommandPathRunsAffectedTests(): Promise<void> {
  const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());

  await withTestingTempProductDir(async (productDir) => {
    const [packageJsonPath] = typescriptTestingLanguage.productInputPaths;
    const tsconfigPath = TYPESCRIPT_MARKER;
    await writeChangedSetFixture(productDir, packageJsonPath, changedSetContent.packageJson);
    await writeChangedSetFixture(productDir, tsconfigPath, changedSetContent.tsconfigJson);

    const selectedTestContent = changedSetVitestFixture(
      `import { value } from '${importPath(paths.selectedTestPath, paths.sourcePath)}';`,
      `expect(value).toBe(${changedSetContent.afterSourceValue})`,
    );
    await writeChangedSetFixture(productDir, paths.selectedTestPath, selectedTestContent);
    await writeChangedSetFixture(
      productDir,
      paths.untouchedTestPath,
      changedSetVitestFixture("", "expect(true).toBe(true)"),
    );
    await writeChangedSetFixture(
      productDir,
      paths.sourcePath,
      changedSetSourceFixture(changedSetContent.beforeSourceValue),
    );

    await initializeGitFixture(productDir);
    await writeChangedSetFixture(
      productDir,
      paths.sourcePath,
      changedSetSourceFixture(changedSetContent.afterSourceValue),
    );

    const result = await execa(...sourceCliCommand(productDir), {
      cwd: process.cwd(),
      reject: false,
    });

    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(SUCCESS_EXIT_CODE);
    const recorded = await readRecordedState(result.stdout);
    const coveredPaths = recorded.runnerOutcomes.flatMap((outcome) => outcome.testPaths);
    expect(coveredPaths).toEqual([paths.selectedTestPath]);
    expect(coveredPaths).not.toContain(paths.untouchedTestPath);
    expect(recorded.discoveredTestPathsDigest).toBe(expectedCoveredPathsDigest([paths.selectedTestPath]));
    expect(recorded.discoveredTestContentDigest).toBe(
      expectedCoveredContentDigest(paths.selectedTestPath, selectedTestContent),
    );
  });
}

export function assertChangedSetPlanningPathPartitionIsOrderIndependent(): void {
  assertProperty(
    fc.record({
      nodeEntries: fc.array(
        fc.oneof(CHANGED_SET_PLANNING_GENERATOR.changedSpecPath(), CHANGED_SET_PLANNING_GENERATOR.changedTestPath()),
        { minLength: 1, maxLength: 8 },
      ),
      sourcePaths: fc.array(arbitrarySourceFilePath(), { minLength: 1, maxLength: 8 }),
    }),
    ({ nodeEntries, sourcePaths }) => {
      const changedPaths = [...nodeEntries.map((entry) => entry.path), ...sourcePaths];
      const repeated = [...changedPaths, ...changedPaths].reverse();

      const base = partitionChangedPaths(changedPaths);
      const repeatedPartition = partitionChangedPaths(repeated);

      expect(repeatedPartition.operands).toEqual(base.operands);
      expect(repeatedPartition.sourceFiles).toEqual(base.sourceFiles);
      expect(new Set(base.operands).size).toBe(base.operands.length);
      expect(new Set(base.sourceFiles).size).toBe(base.sourceFiles.length);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

export function assertChangedSetPlanningOperandUnionDeduplicates(): void {
  assertProperty(
    TEST_DISPATCH_GENERATOR.nodePath().chain((node) =>
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, node).map((relatedTestPath) => ({
        node,
        relatedTestPath,
      }))
    ),
    ({ node, relatedTestPath }) => {
      const operand = nodeOperand(node);
      const merged = mergeChangedSetOperands([operand, operand], [relatedTestPath, relatedTestPath]);

      expect(merged.filter((entry) => entry === operand)).toHaveLength(1);
      expect(merged.filter((entry) => entry === relatedTestPath)).toHaveLength(1);
      expect(new Set(merged).size).toBe(merged.length);
    },
    { level: PROPERTY_LEVEL.L1 },
  );
}

async function planWithGit(
  git: RecordingGitRunner,
  request: ChangedSetPlanHarnessRequest = {},
  languages: readonly TestingLanguageDescriptor[] = [typescriptTestingLanguage],
) {
  return planChangedTestSelection(
    { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), ...request },
    { git: git.git, registry: registry(languages), relatedDepsFor: () => relatedDeps() },
  );
}

async function expectStagedTypeScriptPlan(
  git: RecordingGitRunner,
  operands: readonly string[],
  unresolvedSourceFiles: readonly string[] = [],
): Promise<void> {
  const plan = await planWithGit(git, { staged: true });
  expect(plan.targets).toEqual({ operands, recursive: false });
  expect(plan.unresolvedSourceFiles).toEqual(unresolvedSourceFiles);
}

async function writeChangedSetFixture(productDir: string, path: string, content: string): Promise<void> {
  const absolute = join(productDir, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

function importPath(fromFile: string, toFile: string): string {
  const relativePath = relative(dirname(fromFile), toFile).split(/[/\\]/).join(changedSetContent.posixSeparator);
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function readRecordedState(stdout: string): Promise<TestRunState> {
  const prefix = `${AGENT_TEST_OUTPUT_TEXT.STATE_FILE}: `;
  const stateLine = stdout.split("\n").find((line) => line.startsWith(prefix));
  expect(stateLine).toBeDefined();
  const statePath = stateLine?.slice(prefix.length) ?? "";
  const raw = (await readFile(statePath)).toString();
  const lines = raw.split("\n");
  let terminalLine = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.length > 0) {
      terminalLine = line;
      break;
    }
  }
  return JSON.parse(terminalLine) as TestRunState;
}

function expectedCoveredPathsDigest(paths: readonly string[]): string {
  return expectedSha256(JSON.stringify([...new Set(paths)].sort(compareAsciiStrings)));
}

function expectedCoveredContentDigest(path: string, content: string): string {
  return expectedSha256(JSON.stringify([[path, content]]));
}

function expectedSha256(value: string): string {
  return createHash(changedSetContent.sha256Algorithm).update(value).digest(changedSetContent.hexEncoding);
}

async function initializeGitFixture(productDir: string): Promise<void> {
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.INIT], { cwd: productDir });
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL], {
    cwd: productDir,
  });
  await execa(
    GIT_TEST_COMMAND,
    [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME],
    { cwd: productDir },
  );
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.ADD, "."], { cwd: productDir });
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, "base"], {
    cwd: productDir,
  });
}

function sourceCliCommand(productDir: string): readonly [string, readonly string[]] {
  const [command, sourceCliPath] = SOURCE_CLI_INVOCATION.split(" ") as [string, string];
  return [
    command,
    [
      sourceCliPath,
      "-C",
      productDir,
      TESTING_CLI.commandName,
      TESTING_CLI.passingSubcommand,
      TESTING_CLI.agentOption,
      TESTING_CLI.changedLongFlag,
      TESTING_CLI.baseLongFlag,
      GIT_ROOT_COMMAND.HEAD,
    ],
  ];
}

function changedSetVitestFixture(importLine: string, assertion: string): string {
  return `import { expect, it } from 'vitest'; ${importLine} it('passes', () => ${assertion});`;
}

function nulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${path}\0`).join("");
}

function nameStatusNulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${GIT_DELETE_STATUS_EXAMPLE}\0${path}\0`).join("");
}

function nodeSpecSlug(nodePath: string, suffix: string): string {
  const nodeSegment = nodePath.split("/").at(-1) ?? "";
  const unindexedSegment = nodeSegment.replace(/^\d+-/, "");
  return unindexedSegment.slice(0, -suffix.length);
}

export function registerChangedSetPlanningScenarioTests(): void {
  describe("changed-set planning path partition", () => {
    it("maps a changed spec file and a changed test file to their node operands", () => {
      const enablerNodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const outcomeNodePath = enablerNodePath.replaceAll(KIND_REGISTRY.enabler.suffix, KIND_REGISTRY.outcome.suffix);
      const specPath = specFileUnder(enablerNodePath, KIND_REGISTRY.enabler.suffix);
      const outcomeSpecPath = specFileUnder(outcomeNodePath, KIND_REGISTRY.outcome.suffix);
      const testPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, enablerNodePath),
      );
      const outcomeTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, outcomeNodePath),
      );

      const partition = partitionChangedPaths([specPath, testPath, outcomeSpecPath, outcomeTestPath]);

      expect(partition.operands).toEqual(
        nativeStringOrder([nodeOperand(enablerNodePath), nodeOperand(outcomeNodePath)]),
      );
      expect(partition.sourceFiles).toEqual([]);
    });

    it("routes changed source files through a registered related-test capability", async () => {
      const sourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const relatedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const git = recordingGitRunner([sourcePath]);
      const language = {
        ...descriptorWithRelatedTests([relatedTestPath], [sourcePath]),
        runTests: noRunTests,
      };

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, relatedTestPath);

        const plan = await planChangedTestSelection(
          { productDir },
          {
            git: git.git,
            registry: registry([language]),
            relatedDepsFor: () => relatedDeps(),
          },
        );

        expect(plan.targets).toEqual({ operands: [relatedTestPath], recursive: false });
        expect(plan.unresolvedSourceFiles).toEqual([]);
      });
    });

    it("reports only the source files left unresolved after a related-test capability resolves another source file", async () => {
      const resolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
      const unresolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const relatedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const git = recordingGitRunner([resolvedSourcePath, unresolvedSourcePath]);
      const language = {
        ...descriptorWithRelatedTests([relatedTestPath], [resolvedSourcePath]),
        runTests: noRunTests,
      };

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, relatedTestPath);

        const plan = await planChangedTestSelection(
          { productDir },
          {
            git: git.git,
            registry: registry([language]),
            relatedDepsFor: () => relatedDeps(),
          },
        );

        expect(plan.targets).toEqual({ operands: [relatedTestPath], recursive: false });
        expect(plan.unresolvedSourceFiles).toEqual([unresolvedSourcePath]);
      });
    });

    it("reports a changed source file when no registered related-test capability can resolve it", async () => {
      const sourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
      const git = recordingGitRunner([sourcePath]);

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
        {
          git: git.git,
          registry: registry([descriptorWithoutRelatedTests()]),
          relatedDepsFor: () => relatedDeps(),
        },
      );

      expect(plan.targets).toEqual({ operands: [], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([sourcePath]);
    });

    it("routes untracked source files through a registered related-test capability", async () => {
      const sourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const relatedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const git = recordingGitRunner([], [sourcePath]);
      const language = {
        ...descriptorWithRelatedTests([relatedTestPath], [sourcePath]),
        runTests: noRunTests,
      };

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, relatedTestPath);

        const plan = await planChangedTestSelection(
          { productDir },
          {
            git: git.git,
            registry: registry([language]),
            relatedDepsFor: () => relatedDeps(),
          },
        );

        expect(plan.targets).toEqual({ operands: [relatedTestPath], recursive: false });
        expect(plan.changedPaths).toEqual([sourcePath]);
        expect(plan.unresolvedSourceFiles).toEqual([]);
        expect(
          git.calls.some((call) =>
            call.args.includes(CHANGED_TEST_LS_FILES_COMMAND)
            && call.args.includes(CHANGED_TEST_LS_FILES_OTHERS_FLAG)
            && call.args.includes(CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG)
            && call.args.includes(CHANGED_TEST_NULL_DELIMITED_FLAG)
          ),
        ).toBe(true);
      });
    });

    it("selects a changed spec-tree test file as the changed-set target", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const git = recordingGitRunner([], [testPath]);

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const plan = await planChangedTestSelection(
          { productDir },
          { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
        );

        expect(plan.targets).toEqual({ operands: [testPath], recursive: false });
        expect(plan.changedPaths).toEqual([testPath]);
      });
    });

    it("selects descendant evidence for changed nodes without forwarding no-test node operands", async () => {
      const changedParentNode = "spx/33-renamed-target.enabler";
      const changedNoTestNode = `${changedParentNode}/21-instructions.enabler`;
      const changedChildNode = `${changedParentNode}/32-tested-child.enabler`;
      const removedParentNode = "spx/33-renamed-source.enabler";
      const removedNoTestNode = `${removedParentNode}/21-instructions.enabler`;
      const parentTestPath = `${changedParentNode}/tests/renamed-target.compliance.l1.test.ts`;
      const childTestPath = `${changedChildNode}/tests/tested-child.scenario.l1.test.ts`;
      const git = recordingGitRunner([
        `${removedParentNode}/renamed-source.md`,
        `${removedNoTestNode}/agent-instructions.md`,
        `${changedParentNode}/renamed-target.md`,
        `${changedNoTestNode}/agent-instructions.md`,
        `${changedChildNode}/tested-child.md`,
      ]);

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, parentTestPath);
        await writeTestFileFixture(productDir, childTestPath);

        const plan = await planChangedTestSelection(
          { productDir },
          { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
        );

        expect(plan.targets).toEqual({
          operands: nativeStringOrder([parentTestPath, childTestPath]),
          recursive: false,
        });
        expect(plan.targets.operands).not.toContain(changedNoTestNode);
        expect(plan.targets.operands).not.toContain(removedNoTestNode);
        expect(plan.targets.operands).not.toContain(removedParentNode);
      });
    });

    it("preserves changed path whitespace from name-status diff output", async () => {
      const pathSpace = String.fromCodePoint(32);
      const sourcePath = `${sampleLiteralTestValue(arbitrarySourceFilePath())}${pathSpace}`;
      const git = recordingGitRunner([sourcePath]);

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
        {
          git: git.git,
          registry: registry([descriptorWithoutRelatedTests()]),
          relatedDepsFor: () => relatedDeps(),
        },
      );

      expect(plan.changedPaths).toEqual([sourcePath]);
      expect(plan.unresolvedSourceFiles).toEqual([sourcePath]);
      expect(
        git.calls.some((call) =>
          call.args.includes(CHANGED_TEST_DIFF_COMMAND)
          && call.args.includes(CHANGED_TEST_DIFF_NAME_STATUS_FLAG)
          && call.args.includes(CHANGED_TEST_NULL_DELIMITED_FLAG)
          && !call.args.includes(CHANGED_TEST_DIFF_CACHED_FLAG)
        ),
      ).toBe(true);
    });

    it("includes both non-staged rename paths from NUL-delimited name-status output", async () => {
      const pathTab = String.fromCodePoint(9);
      const pathNewline = String.fromCodePoint(10);
      const oldPath = `${sampleLiteralTestValue(arbitrarySourceFilePath())}${pathTab}`;
      const newPath = `${sampleLiteralTestValue(arbitrarySourceFilePath())}${GIT_RENAMED_PATH_SUFFIX}${pathNewline}`;
      const git = renameGitRunner(oldPath, newPath);

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
        {
          git: git.git,
          registry: registry([descriptorWithoutRelatedTests()]),
          relatedDepsFor: () => relatedDeps(),
        },
      );

      expect(plan.changedPaths).toEqual(nativeStringOrder([oldPath, newPath]));
      expect(plan.unresolvedSourceFiles).toEqual(nativeStringOrder([oldPath, newPath]));
    });

    it("routes changed testing harness files through related-test resolution", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.harnessAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());

      await expectStagedTypeScriptPlan(
        stagedSourceGitRunner(
          fixture.sourcePath,
          paths.testPath,
          changedSetImportStatement(fixture.importSpecifier),
          tsconfigWithPaths(fixture.tsconfigPaths),
        ),
        [paths.testPath],
      );
    });

    it("routes indirectly imported source files through related-test resolution", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceCandidatesGitRunner(
        [fixture.sourcePath],
        new Map([
          [
            paths.testPath,
            `import { helper } from "${paths.helperImportSpecifier}";
  
  helper;
  `,
          ],
          [
            paths.helperPath,
            changedSetImportStatement(fixture.importSpecifier),
          ],
        ]),
        tsconfigWithPaths(fixture.tsconfigPaths),
      );

      await expectStagedTypeScriptPlan(git, [paths.testPath]);
    });

    it("keeps walking direct changed helper hits to resolve transitive source files", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixture());
      const harness = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.harnessAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceCandidatesGitRunner(
        [harness.sourcePath, fixture.sourcePath],
        new Map([
          [
            paths.testPath,
            changedSetImportStatement(harness.importSpecifier),
          ],
          [
            harness.sourcePath,
            `import { helper } from "${fixture.importSpecifier}";
  
  helper;
  `,
          ],
        ]),
        tsconfigWithPaths({ ...fixture.tsconfigPaths, ...harness.tsconfigPaths }),
      );

      await expectStagedTypeScriptPlan(git, [paths.testPath]);
    });

    it("resolves tsconfig alias directory imports to changed source index modules", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.indexAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());

      await expectStagedTypeScriptPlan(
        stagedSourceGitRunner(
          fixture.sourcePath,
          paths.testPath,
          changedSetImportStatement(fixture.importSpecifier),
          tsconfigWithPaths(fixture.tsconfigPaths),
        ),
        [paths.testPath],
      );
    });

    it("routes changed alias source roots through related-test resolution", async () => {
      await assertChangedAliasSourceRootsRouteThroughRelatedTests();
    });

    it("rejects malformed tsconfig content during related-test resolution", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceGitRunner(
        fixture.sourcePath,
        paths.testPath,
        changedSetImportStatement(fixture.importSpecifier),
        changedSetContent.malformedTsconfig,
      );

      await expect(
        planChangedTestSelection(
          { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
          { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
        ),
      ).rejects.toThrow(TYPESCRIPT_MARKER);
    });

    it("does not prefix-match exact tsconfig path aliases", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.exactAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());

      await expectStagedTypeScriptPlan(
        stagedSourceGitRunner(
          fixture.sourcePath,
          paths.testPath,
          changedSetImportStatement(fixture.importSpecifier),
          tsconfigWithPaths(fixture.tsconfigPaths),
        ),
        [],
        [fixture.sourcePath],
      );
    });

    it("resolves tsconfig path alias fallback targets", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fallbackAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());

      await expectStagedTypeScriptPlan(
        stagedSourceGitRunner(
          fixture.sourcePath,
          paths.testPath,
          changedSetImportStatement(fixture.importSpecifier),
          tsconfigWithPaths(fixture.tsconfigPaths),
        ),
        [paths.testPath],
      );
    });

    it("propagates non-missing module read failures during related-test resolution", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.readFailureFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const testContent = changedSetImportStatement(fixture.importSpecifier);
      const git = recordingGitRunner([fixture.sourcePath]);
      const failure = new Error(changedSetContent.readFailureMessage);
      const deps = relatedDeps();

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, paths.testPath);

        await expect(
          planChangedTestSelection(
            { productDir },
            {
              git: git.git,
              registry: registry([typescriptTestingLanguage]),
              relatedDepsFor: () => ({
                ...deps,
                readFile: (path) => {
                  if (path === TYPESCRIPT_MARKER) return Promise.resolve(tsconfigWithPaths(fixture.tsconfigPaths));
                  if (path === paths.testPath) return Promise.resolve(testContent);
                  if (path === fixture.missingPath) return Promise.reject(failure);
                  return deps.readFile(path);
                },
              }),
            },
          ),
        ).rejects.toThrow(changedSetContent.readFailureMessage);
      });
    });

    it("does not select unrelated testing harness consumers for changed harness sources", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.harnessConsumersFixture());
      const selectedConsumers = new Map(Object.entries(fixture.selectedConsumers));
      const unrelatedConsumers = new Map(Object.entries(fixture.unrelatedConsumers));
      const git = stagedSourceCandidatesGitRunner(
        fixture.sourcePaths,
        new Map([...selectedConsumers, ...unrelatedConsumers]),
        tsconfigWithPaths(fixture.tsconfigPaths),
      );

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
        { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
      );

      expect(plan.targets).toEqual({
        operands: nativeStringOrder([...selectedConsumers.keys()]),
        recursive: false,
      });
      expect(plan.unresolvedSourceFiles).toEqual([]);
    });

    it("ignores changed paths outside the spec tree and source roots", () => {
      const nonSourcePath = sampleLiteralTestValue(arbitraryDomainLiteral());

      const partition = partitionChangedPaths([nonSourcePath]);

      expect(partition.operands).toEqual([]);
      expect(partition.sourceFiles).toEqual([]);
      expect(partition.productInputChanged).toBe(false);
    });

    it("selects the full spec tree when product config changes", async () => {
      const git = recordingGitRunner([CONFIG_FILENAMES.yaml]);

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
        { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
      );

      expect(plan.targets).toEqual({ operands: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], recursive: true });
    });

    it.each(typescriptTestingLanguage.productInputPaths)(
      "selects the full spec tree when TypeScript product input changes: %s",
      async (productInputPath) => {
        const git = recordingGitRunner([productInputPath]);

        const plan = await planChangedTestSelection(
          { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
          { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
        );

        expect(plan.targets).toEqual({ operands: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], recursive: true });
        expect(plan.unresolvedSourceFiles).toEqual([]);
      },
    );

    it.each(CHANGED_TEST_PRODUCT_INPUT_PATHS)(
      "selects the full spec tree when changed-set product input changes: %s",
      async (productInputPath) => {
        const git = recordingGitRunner([productInputPath]);

        const plan = await planChangedTestSelection(
          { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
          { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
        );

        expect(plan.targets).toEqual({ operands: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], recursive: true });
        expect(plan.unresolvedSourceFiles).toEqual([]);
      },
    );

    it("defaults the changed base to origin of the default branch and honors an explicit base ref", async () => {
      const git = recordingGitRunner([]);
      await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
        { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
      );
      await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), baseRef: changedSetDefaultBranchName() },
        { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
      );

      const revParseRefs = git.calls
        .filter((call) => call.command === GIT_TEST_COMMAND && call.args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE))
        .map((call) => call.args.at(-1));

      expect(revParseRefs).toContain(changedSetDefaultBaseRef());
      expect(revParseRefs).toContain(changedSetDefaultBranchName());
    });

    it("uses the empty tree as the HEAD base when a repository has no commits", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const git = unbornHeadGitRunner([testPath]);

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const plan = await planChangedTestSelection(
          { productDir, baseRef: GIT_ROOT_COMMAND.HEAD },
          { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
        );

        expect(plan.baseSha).toBe(EMPTY_TREE_SHA);
        expect(plan.targets).toEqual({ operands: [testPath], recursive: false });
      });
    });

    it("diffs the staged snapshot when changed-set planning requests staged changes", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
      const git = recordingGitRunner([testPath]);

      await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
        { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
      );

      const diffCall = git.calls.find((call) =>
        call.command === GIT_TEST_COMMAND && call.args.includes(CHANGED_TEST_DIFF_COMMAND)
      );

      expect(diffCall?.args).toContain(CHANGED_TEST_DIFF_CACHED_FLAG);
      expect(diffCall?.args).toContain(CHANGED_TEST_DIFF_NAME_STATUS_FLAG);
      expect(diffCall?.args).toContain(CHANGED_TEST_NULL_DELIMITED_FLAG);
      expect(
        git.calls.some((call) =>
          call.args.includes(CHANGED_TEST_LS_FILES_COMMAND)
          && call.args.includes(CHANGED_TEST_LS_FILES_OTHERS_FLAG)
        ),
      ).toBe(false);
    });

    it("includes both staged rename paths from NUL-delimited name-status output", () => {
      const pathTab = String.fromCodePoint(9);
      const pathNewline = String.fromCodePoint(10);
      const oldPath = `${sampleLiteralTestValue(arbitrarySourceFilePath())}${pathTab}`;
      const newPath = `${sampleLiteralTestValue(arbitrarySourceFilePath())}${GIT_RENAMED_PATH_SUFFIX}${pathNewline}`;

      expect(changedPathsFromNameStatus(`${GIT_RENAME_STATUS_EXAMPLE}\0${oldPath}\0${newPath}\0`)).toEqual(
        nativeStringOrder([oldPath, newPath]),
      );
    });

    it("resolves staged source changes from test candidates and content in the index", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceGitRunner(
        fixture.sourcePath,
        paths.testPath,
        changedSetImportStatement(fixture.importSpecifier),
        tsconfigWithPaths(fixture.tsconfigPaths),
      );

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
        { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
      );

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
      expect(git.calls.some((call) => call.args.includes(CHANGED_TEST_LS_FILES_COMMAND))).toBe(true);
      expect(
        git.calls.some((call) =>
          call.args.includes(CHANGED_TEST_LS_FILES_COMMAND) && call.args.includes(CHANGED_TEST_NULL_DELIMITED_FLAG)
        ),
      ).toBe(true);
      expect(git.calls.some((call) => call.args.includes(`${CHANGED_TEST_INDEX_PATH_PREFIX}${paths.testPath}`))).toBe(
        true,
      );
    });

    it.each([
      changedSetContent.gitStagedPathMissingMessage,
      changedSetContent.gitStagedAmbiguousPathMessage,
      changedSetContent.gitStagedNotInIndexMessage,
    ])("ignores staged candidate test paths missing from the index: %s", async (missingMessage) => {
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedMissingCandidateGitRunner(
        paths.sourcePath,
        paths.testPath,
        missingMessage,
      );

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
        { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
      );

      expect(plan.targets).toEqual({ operands: [], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([paths.sourcePath]);
    });
  });
}
