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
import { partitionChangedPaths } from "@/domains/test/changed-set-planning";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/git/root";
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
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import {
  CHANGED_SET_PLANNING_GENERATOR,
  type ChangedSetAliasFixture,
  type ChangedSetFixturePaths,
  changedSetImportStatement,
  sampleChangedSetPlanningValue,
  tsconfigWithPaths,
} from "@testing/generators/testing/changed-set-planning";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { GIT_TEST_COMMAND, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";

const defaultBranchName = sampleLiteralTestValue(arbitraryDomainLiteral());
const defaultBaseRef = [GIT_ROOT_COMMAND.ORIGIN, defaultBranchName].join("/");
const defaultBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
const explicitBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
const changedSetContent = CHANGED_SET_PLANNING_GENERATOR.content();

interface GitCall {
  readonly command: string;
  readonly args: readonly string[];
}

interface RecordingGitRunner {
  readonly calls: readonly GitCall[];
  readonly git: GitDependencies;
}

interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

type GitCommandHandler = (
  command: string,
  args: readonly string[],
) => GitCommandResult | Promise<GitCommandResult>;

function nulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${path}\0`).join("");
}

function nameStatusNulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${GIT_DELETE_STATUS_EXAMPLE}\0${path}\0`).join("");
}

function gitRunner(handler: GitCommandHandler): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        return await handler(command, args);
      },
    },
  };
}

function defaultGitCommandResult(
  args: readonly string[],
  resolveExplicitBase = true,
): GitCommandResult | undefined {
  if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
    return { exitCode: 0, stdout: defaultBaseRef, stderr: "" };
  }
  const lastArg = args.at(-1);
  if (lastArg === defaultBaseRef) {
    return { exitCode: 0, stdout: defaultBaseSha, stderr: "" };
  }
  if (lastArg === GIT_ROOT_COMMAND.HEAD && args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
    return { exitCode: 0, stdout: headSha, stderr: "" };
  }
  if (
    resolveExplicitBase
    && lastArg !== undefined
    && args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)
  ) {
    return { exitCode: 0, stdout: explicitBaseSha, stderr: "" };
  }
  return undefined;
}

function recordingGitRunner(
  changedPaths: readonly string[],
  untrackedPaths: readonly string[] = [],
): RecordingGitRunner {
  return gitRunner((_command, args) => {
    const defaultResult = defaultGitCommandResult(args);
    if (defaultResult !== undefined) return defaultResult;
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      const stdout = args.includes(CHANGED_TEST_DIFF_NAME_STATUS_FLAG)
        ? nameStatusNulDelimited(changedPaths)
        : nulDelimited(changedPaths);
      return { exitCode: 0, stdout, stderr: "" };
    }
    if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
      return { exitCode: 0, stdout: nulDelimited(untrackedPaths), stderr: "" };
    }
    return { exitCode: 0, stdout: headSha, stderr: "" };
  });
}

function renameGitRunner(oldPath: string, newPath: string): RecordingGitRunner {
  return gitRunner((_command, args) => {
    const defaultResult = defaultGitCommandResult(args, false);
    if (defaultResult !== undefined) return defaultResult;
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      return { exitCode: 0, stdout: `${GIT_RENAME_STATUS_EXAMPLE}\0${oldPath}\0${newPath}\0`, stderr: "" };
    }
    if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: headSha, stderr: "" };
  });
}

function unbornHeadGitRunner(changedPaths: readonly string[]): RecordingGitRunner {
  return gitRunner((_command, args) => {
    if (args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
      return { exitCode: 1, stdout: "", stderr: "unknown revision" };
    }
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      return { exitCode: 0, stdout: nameStatusNulDelimited(changedPaths), stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
}

function stagedSourceGitRunner(
  sourcePath: string,
  testPath: string,
  testContent: string,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return stagedSourceCandidatesGitRunner(
    [sourcePath],
    new Map([[testPath, testContent]]),
    tsconfigContent,
  );
}

function stagedMissingCandidateGitRunner(
  sourcePath: string,
  testPath: string,
  missingStderr: string,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return stagedSourceRunner({
    sourcePaths: [sourcePath],
    candidatePaths: [testPath],
    tsconfigContent,
    readIndexPath: (path) => {
      if (path === TYPESCRIPT_MARKER) {
        return { exitCode: 0, stdout: tsconfigContent, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: missingStderr };
    },
  });
}

function stagedSourceCandidatesGitRunner(
  sourcePaths: readonly string[],
  candidateContents: ReadonlyMap<string, string>,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return stagedSourceRunner({
    sourcePaths,
    candidatePaths: [...candidateContents.keys()],
    tsconfigContent,
    readIndexPath: (path) => ({
      exitCode: 0,
      stdout: path === TYPESCRIPT_MARKER ? tsconfigContent : candidateContents.get(path) ?? "",
      stderr: "",
    }),
  });
}

function stagedSourceRunner({
  sourcePaths,
  candidatePaths,
  readIndexPath,
}: {
  readonly sourcePaths: readonly string[];
  readonly candidatePaths: readonly string[];
  readonly tsconfigContent: string;
  readonly readIndexPath: (path: string) => GitCommandResult;
}): RecordingGitRunner {
  return gitRunner((_command, args) => {
    const defaultResult = defaultGitCommandResult(args, false);
    if (defaultResult !== undefined) return defaultResult;
    if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
      return { exitCode: 0, stdout: nameStatusNulDelimited(sourcePaths), stderr: "" };
    }
    if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
      return { exitCode: 0, stdout: nulDelimited(candidatePaths), stderr: "" };
    }
    if (args.includes(CHANGED_TEST_SHOW_COMMAND)) {
      const path = args.find((arg) => arg.startsWith(CHANGED_TEST_INDEX_PATH_PREFIX))?.slice(1) ?? "";
      return readIndexPath(path);
    }
    return { exitCode: 0, stdout: headSha, stderr: "" };
  });
}

function descriptorWithRelatedTests(
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

function descriptorWithoutRelatedTests(): TestingLanguageDescriptor {
  return {
    ...typescriptTestingLanguage,
    relatedTestPaths: undefined,
  };
}

function registry(languages: readonly TestingLanguageDescriptor[]): TestingRegistry {
  return { languages };
}

function relatedDeps(): RelatedTestDependencies {
  return {
    isLanguagePresent: () => true,
    runCommand: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
    readFile: (path) => Promise.resolve(path === TYPESCRIPT_MARKER ? changedSetContent.emptyTsconfig : ""),
  };
}

function nodeSpecSlug(nodePath: string, suffix: string): string {
  const nodeSegment = nodePath.split("/").at(-1) ?? "";
  const unindexedSegment = nodeSegment.replace(/^\d+-/, "");
  return unindexedSegment.slice(0, -suffix.length);
}

function specFileUnder(nodePath: string, suffix: string): string {
  return `${nodeOperand(nodePath)}/${nodeSpecSlug(nodePath, suffix)}.md`;
}

function nativeStringOrder(paths: readonly string[]): readonly string[] {
  return [...paths].sort(compareAsciiStrings);
}

async function noRunTests(_request: TestRunRequest): Promise<TestRunInvocation> {
  return { invoked: false };
}

async function planWithRelatedTest({
  changedPaths = [],
  untrackedPaths = [],
  resolvedSourcePaths,
}: {
  readonly changedPaths?: readonly string[];
  readonly untrackedPaths?: readonly string[];
  readonly resolvedSourcePaths: readonly string[];
}): Promise<{
  readonly git: RecordingGitRunner;
  readonly plan: Awaited<ReturnType<typeof planChangedTestSelection>>;
  readonly relatedTestPath: string;
}> {
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const relatedTestPath = sampleDispatchValue(
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
  );
  const git = recordingGitRunner(changedPaths, untrackedPaths);
  const language = {
    ...descriptorWithRelatedTests([relatedTestPath], resolvedSourcePaths),
    runTests: noRunTests,
  };

  let plan: Awaited<ReturnType<typeof planChangedTestSelection>> | undefined;
  await withTestingTempProductDir(async (productDir) => {
    await writeTestFileFixture(productDir, relatedTestPath);

    plan = await planChangedTestSelection(
      { productDir },
      {
        git: git.git,
        registry: registry([language]),
        relatedDepsFor: () => relatedDeps(),
      },
    );
  });

  if (plan === undefined) {
    throw new Error("changed-set related-test plan was not produced");
  }
  return { git, plan, relatedTestPath };
}

async function planStagedAliasFixture(
  fixture: ChangedSetAliasFixture,
): Promise<{
  readonly git: RecordingGitRunner;
  readonly paths: ChangedSetFixturePaths;
  readonly plan: Awaited<ReturnType<typeof planChangedTestSelection>>;
}> {
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

  return { git, paths, plan };
}

async function planProductInputChange(
  productInputPath: string,
  languages: readonly TestingLanguageDescriptor[] = [],
): Promise<Awaited<ReturnType<typeof planChangedTestSelection>>> {
  const git = recordingGitRunner([productInputPath]);
  return await planChangedTestSelection(
    { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
    { git: git.git, registry: registry(languages), relatedDepsFor: () => relatedDeps() },
  );
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
      const { plan, relatedTestPath } = await planWithRelatedTest({
        changedPaths: [sourcePath],
        resolvedSourcePaths: [sourcePath],
      });

      expect(plan.targets).toEqual({ operands: [relatedTestPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
    });

    it("reports only the source files left unresolved after a related-test capability resolves another source file", async () => {
      const [resolvedSourcePath, unresolvedSourcePath] = sampleLiteralTestValue(
        fc
          .tuple(arbitrarySourceFilePath(), arbitrarySourceFilePath())
          .filter(([resolvedPath, unresolvedPath]) => resolvedPath !== unresolvedPath),
      );
      const { plan, relatedTestPath } = await planWithRelatedTest({
        changedPaths: [resolvedSourcePath, unresolvedSourcePath],
        resolvedSourcePaths: [resolvedSourcePath],
      });

      expect(plan.targets).toEqual({ operands: [relatedTestPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([unresolvedSourcePath]);
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
      const { git, plan, relatedTestPath } = await planWithRelatedTest({
        untrackedPaths: [sourcePath],
        resolvedSourcePaths: [sourcePath],
      });

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
      const { paths, plan } = await planStagedAliasFixture(fixture);

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
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

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
        { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
      );

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
    });

    it("keeps traversing through directly changed helper modules", async () => {
      const helperFixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.harnessAliasFixture());
      const downstreamFixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceCandidatesGitRunner(
        [downstreamFixture.sourcePath, helperFixture.sourcePath],
        new Map([
          [
            paths.testPath,
            `import { helper } from "${helperFixture.importSpecifier}";

helper;
`,
          ],
          [
            helperFixture.sourcePath,
            changedSetImportStatement(downstreamFixture.importSpecifier),
          ],
        ]),
        tsconfigWithPaths({
          ...helperFixture.tsconfigPaths,
          ...downstreamFixture.tsconfigPaths,
        }),
      );

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
        { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
      );

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
    });

    it("resolves tsconfig alias directory imports to changed source index modules", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.indexAliasFixture());
      const { paths, plan } = await planStagedAliasFixture(fixture);

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
    });

    it.each(sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixtureSet()))(
      "routes changed alias source root %s through related-test resolution",
      async (fixture) => {
        const { paths, plan } = await planStagedAliasFixture(fixture);

        expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
        expect(plan.unresolvedSourceFiles).toEqual([]);
      },
    );

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
      const { plan } = await planStagedAliasFixture(fixture);

      expect(plan.targets).toEqual({ operands: [], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([fixture.sourcePath]);
    });

    it("resolves tsconfig path alias fallback targets", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fallbackAliasFixture());
      const { paths, plan } = await planStagedAliasFixture(fixture);

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
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
      const plan = await planProductInputChange(CONFIG_FILENAMES.yaml);

      expect(plan.targets).toEqual({ operands: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], recursive: true });
    });

    it.each(typescriptTestingLanguage.productInputPaths)(
      "selects the full spec tree when TypeScript product input changes: %s",
      async (productInputPath) => {
        const plan = await planProductInputChange(productInputPath, [typescriptTestingLanguage]);

        expect(plan.targets).toEqual({ operands: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], recursive: true });
        expect(plan.unresolvedSourceFiles).toEqual([]);
      },
    );

    it.each(CHANGED_TEST_PRODUCT_INPUT_PATHS)(
      "selects the full spec tree when changed-set product input changes: %s",
      async (productInputPath) => {
        const plan = await planProductInputChange(productInputPath, [typescriptTestingLanguage]);

        expect(plan.targets).toEqual({ operands: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], recursive: true });
        expect(plan.unresolvedSourceFiles).toEqual([]);
      },
    );

    it("defaults the changed base to origin of the default branch and honors an explicit base ref", async () => {
      const git = recordingGitRunner([]);
      const defaultBasePlan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
        { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
      );
      const explicitBasePlan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), baseRef: defaultBranchName },
        { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
      );

      const revParseRefs = git.calls
        .filter((call) => call.command === GIT_TEST_COMMAND && call.args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE))
        .map((call) => call.args.at(-1));

      expect(revParseRefs).toContain(defaultBaseRef);
      expect(revParseRefs).toContain(defaultBranchName);
      expect(defaultBasePlan.baseSha).toBe(defaultBaseSha);
      expect(defaultBasePlan.headSha).toBe(headSha);
      expect(explicitBasePlan.baseSha).toBe(explicitBaseSha);
      expect(explicitBasePlan.headSha).toBe(headSha);
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
      const { git, paths, plan } = await planStagedAliasFixture(fixture);

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
