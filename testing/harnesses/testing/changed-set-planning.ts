import { describe, expect, it } from "vitest";

import {
  CHANGED_TEST_DIFF_CACHED_FLAG as GIT_DIFF_CACHED_FLAG,
  CHANGED_TEST_DIFF_COMMAND as GIT_DIFF_COMMAND,
  CHANGED_TEST_DIFF_NAME_STATUS_FLAG as GIT_NAME_STATUS_FLAG,
  CHANGED_TEST_INDEX_PATH_PREFIX as GIT_INDEX_PATH_PREFIX,
  CHANGED_TEST_LS_FILES_COMMAND as GIT_LS_FILES_COMMAND,
  CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG as GIT_LS_FILES_EXCLUDE_STANDARD_FLAG,
  CHANGED_TEST_LS_FILES_OTHERS_FLAG as GIT_LS_FILES_OTHERS_FLAG,
  CHANGED_TEST_NULL_DELIMITED_FLAG as GIT_NULL_DELIMITED_FLAG,
  CHANGED_TEST_PRODUCT_INPUT_PATHS as CHANGED_SET_PRODUCT_INPUT_PATHS,
  CHANGED_TEST_SHOW_COMMAND as GIT_SHOW_COMMAND,
  type ChangedTestSelection,
  EMPTY_TREE_SHA,
  planChangedTestSelection,
} from "@/commands/test/changed-set-planning";
import { CONFIG_FILENAMES } from "@/config/index";
import { partitionChangedPaths } from "@/domains/test/changed-set-planning";
import {
  GIT_DELETE_STATUS_EXAMPLE,
  GIT_NULL_RECORD_SEPARATOR,
  GIT_RENAME_STATUS_EXAMPLE,
  GIT_RENAMED_PATH_SUFFIX,
} from "@/lib/git/name-status";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
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

interface GitResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

type GitResponder = (args: readonly string[]) => GitResult | undefined;

function nulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${path}${GIT_NULL_RECORD_SEPARATOR}`).join("");
}

function nameStatusNulDelimited(paths: readonly string[]): string {
  return paths
    .map((path) => `${GIT_DELETE_STATUS_EXAMPLE}${GIT_NULL_RECORD_SEPARATOR}${path}${GIT_NULL_RECORD_SEPARATOR}`)
    .join("");
}

function gitResult(stdout: string, exitCode = 0, stderr = ""): GitResult {
  return { exitCode, stdout, stderr };
}

function createRecordingGitRunner(responder: GitResponder): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        return responder(args) ?? gitResult(headSha);
      },
    },
  };
}

function standardRefResult(args: readonly string[]): GitResult | undefined {
  if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
    return gitResult(defaultBaseRef);
  }
  const lastArg = args.at(-1);
  if (lastArg === defaultBaseRef) {
    return gitResult(defaultBaseSha);
  }
  if (lastArg !== undefined && lastArg !== headSha && args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
    return gitResult(explicitBaseSha);
  }
  return undefined;
}

function recordingGitRunner(
  changedPaths: readonly string[],
  untrackedPaths: readonly string[] = [],
): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    const refResult = standardRefResult(args);
    if (refResult !== undefined) return refResult;
    if (args.includes(GIT_DIFF_COMMAND)) {
      return gitResult(
        args.includes(GIT_NAME_STATUS_FLAG)
          ? nameStatusNulDelimited(changedPaths)
          : nulDelimited(changedPaths),
      );
    }
    if (args.includes(GIT_LS_FILES_COMMAND)) return gitResult(nulDelimited(untrackedPaths));
    return undefined;
  });
}

function renameGitRunner(oldPath: string, newPath: string): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    const refResult = standardRefResult(args);
    if (refResult !== undefined) return refResult;
    if (args.includes(GIT_DIFF_COMMAND)) {
      return gitResult(
        [
          GIT_RENAME_STATUS_EXAMPLE,
          oldPath,
          newPath,
        ].join(GIT_NULL_RECORD_SEPARATOR) + GIT_NULL_RECORD_SEPARATOR,
      );
    }
    if (args.includes(GIT_LS_FILES_COMMAND)) return gitResult("");
    return undefined;
  });
}

function unbornHeadGitRunner(changedPaths: readonly string[]): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    if (args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) return gitResult("", 1, "unknown revision");
    if (args.includes(GIT_DIFF_COMMAND)) return gitResult(nameStatusNulDelimited(changedPaths));
    return gitResult("");
  });
}

function stagedSourceGitRunner(
  sourcePath: string,
  testPath: string,
  testContent: string,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return stagedSourceCandidatesGitRunner([sourcePath], new Map([[testPath, testContent]]), tsconfigContent);
}

function stagedMissingCandidateGitRunner(
  sourcePath: string,
  testPath: string,
  missingStderr: string,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return stagedSourceCandidatesGitRunner(
    [sourcePath],
    new Map([[testPath, gitResult("", 1, missingStderr)]]),
    tsconfigContent,
  );
}

function stagedSourceCandidatesGitRunner(
  sourcePaths: readonly string[],
  candidateContents: ReadonlyMap<string, string | GitResult>,
  tsconfigContent: string = changedSetContent.emptyTsconfig,
): RecordingGitRunner {
  return createRecordingGitRunner((args) => {
    const refResult = standardRefResult(args);
    if (refResult !== undefined) return refResult;
    if (args.includes(GIT_DIFF_COMMAND)) return gitResult(nameStatusNulDelimited(sourcePaths));
    if (args.includes(GIT_LS_FILES_COMMAND)) return gitResult(nulDelimited([...candidateContents.keys()]));
    if (args.includes(GIT_SHOW_COMMAND)) {
      const path = args.find((arg) => arg.startsWith(GIT_INDEX_PATH_PREFIX))?.slice(1) ?? "";
      if (path === TYPESCRIPT_MARKER) return gitResult(tsconfigContent);
      const candidate = candidateContents.get(path) ?? "";
      return typeof candidate === "string" ? gitResult(candidate) : candidate;
    }
    return undefined;
  });
}

function planStagedTypescript(git: GitDependencies): Promise<ChangedTestSelection> {
  return planChangedTestSelection(
    { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
    { git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
  );
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
            call.args.includes(GIT_LS_FILES_COMMAND)
            && call.args.includes(GIT_LS_FILES_OTHERS_FLAG)
            && call.args.includes(GIT_LS_FILES_EXCLUDE_STANDARD_FLAG)
            && call.args.includes(GIT_NULL_DELIMITED_FLAG)
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
          call.args.includes(GIT_DIFF_COMMAND)
          && call.args.includes(GIT_NAME_STATUS_FLAG)
          && call.args.includes(GIT_NULL_DELIMITED_FLAG)
          && !call.args.includes(GIT_DIFF_CACHED_FLAG)
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
      const git = stagedSourceGitRunner(
        fixture.sourcePath,
        paths.testPath,
        changedSetImportStatement(fixture.importSpecifier),
        tsconfigWithPaths(fixture.tsconfigPaths),
      );

      const plan = await planStagedTypescript(git.git);

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

      const plan = await planStagedTypescript(git.git);

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
    });

    it("resolves tsconfig alias directory imports to changed source index modules", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.indexAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceGitRunner(
        fixture.sourcePath,
        paths.testPath,
        changedSetImportStatement(fixture.importSpecifier),
        tsconfigWithPaths(fixture.tsconfigPaths),
      );

      const plan = await planStagedTypescript(git.git);

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
    });

    it.each(sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.aliasFixtureSet()))(
      "routes changed alias source root %s through related-test resolution",
      async (fixture) => {
        const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
        const git = stagedSourceGitRunner(
          fixture.sourcePath,
          paths.testPath,
          changedSetImportStatement(fixture.importSpecifier),
          tsconfigWithPaths(fixture.tsconfigPaths),
        );

        const plan = await planStagedTypescript(git.git);

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
        planStagedTypescript(git.git),
      ).rejects.toThrow(TYPESCRIPT_MARKER);
    });

    it("does not prefix-match exact tsconfig path aliases", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.exactAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceGitRunner(
        fixture.sourcePath,
        paths.testPath,
        changedSetImportStatement(fixture.importSpecifier),
        tsconfigWithPaths(fixture.tsconfigPaths),
      );

      const plan = await planStagedTypescript(git.git);

      expect(plan.targets).toEqual({ operands: [], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([fixture.sourcePath]);
    });

    it("resolves tsconfig path alias fallback targets", async () => {
      const fixture = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fallbackAliasFixture());
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());
      const git = stagedSourceGitRunner(
        fixture.sourcePath,
        paths.testPath,
        changedSetImportStatement(fixture.importSpecifier),
        tsconfigWithPaths(fixture.tsconfigPaths),
      );

      const plan = await planStagedTypescript(git.git);

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

      const plan = await planStagedTypescript(git.git);

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

    it.each(CHANGED_SET_PRODUCT_INPUT_PATHS)(
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
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), baseRef: defaultBranchName },
        { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
      );

      const revParseRefs = git.calls
        .filter((call) => call.command === GIT_TEST_COMMAND && call.args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE))
        .map((call) => call.args.at(-1));

      expect(revParseRefs).toContain(defaultBaseRef);
      expect(revParseRefs).toContain(defaultBranchName);
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
        call.command === GIT_TEST_COMMAND && call.args.includes(GIT_DIFF_COMMAND)
      );

      expect(diffCall?.args).toContain(GIT_DIFF_CACHED_FLAG);
      expect(diffCall?.args).toContain(GIT_NAME_STATUS_FLAG);
      expect(diffCall?.args).toContain(GIT_NULL_DELIMITED_FLAG);
      expect(
        git.calls.some((call) =>
          call.args.includes(GIT_LS_FILES_COMMAND)
          && call.args.includes(GIT_LS_FILES_OTHERS_FLAG)
        ),
      ).toBe(false);
    });

    it("includes both staged rename paths from NUL-delimited name-status output", async () => {
      const pathTab = String.fromCodePoint(9);
      const pathNewline = String.fromCodePoint(10);
      const oldPath = `${sampleLiteralTestValue(arbitrarySourceFilePath())}${pathTab}`;
      const newPath = `${sampleLiteralTestValue(arbitrarySourceFilePath())}${GIT_RENAMED_PATH_SUFFIX}${pathNewline}`;
      const git = renameGitRunner(oldPath, newPath);

      const plan = await planChangedTestSelection(
        { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
        { git: git.git, registry: registry([descriptorWithoutRelatedTests()]), relatedDepsFor: () => relatedDeps() },
      );

      expect(plan.changedPaths).toEqual(nativeStringOrder([oldPath, newPath]));
      expect(plan.unresolvedSourceFiles).toEqual(nativeStringOrder([oldPath, newPath]));
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

      const plan = await planStagedTypescript(git.git);

      expect(plan.targets).toEqual({ operands: [paths.testPath], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([]);
      expect(git.calls.some((call) => call.args.includes(GIT_LS_FILES_COMMAND))).toBe(true);
      expect(
        git.calls.some((call) =>
          call.args.includes(GIT_LS_FILES_COMMAND) && call.args.includes(GIT_NULL_DELIMITED_FLAG)
        ),
      ).toBe(true);
      expect(git.calls.some((call) => call.args.includes(`${GIT_INDEX_PATH_PREFIX}${paths.testPath}`))).toBe(
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

      const plan = await planStagedTypescript(git.git);

      expect(plan.targets).toEqual({ operands: [], recursive: false });
      expect(plan.unresolvedSourceFiles).toEqual([paths.sourcePath]);
    });
  });
}
