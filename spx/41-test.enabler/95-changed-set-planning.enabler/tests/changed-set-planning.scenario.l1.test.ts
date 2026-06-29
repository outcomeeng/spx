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
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { GIT_TEST_COMMAND, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";

const defaultBranchName = sampleLiteralTestValue(arbitraryDomainLiteral());
const defaultBaseRef = [GIT_ROOT_COMMAND.ORIGIN, defaultBranchName].join("/");
const defaultBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
const explicitBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());

interface GitCall {
  readonly command: string;
  readonly args: readonly string[];
}

interface RecordingGitRunner {
  readonly calls: readonly GitCall[];
  readonly git: GitDependencies;
}

function nulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${path}\0`).join("");
}

function nameStatusNulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${GIT_DELETE_STATUS_EXAMPLE}\0${path}\0`).join("");
}

function recordingGitRunner(
  changedPaths: readonly string[],
  untrackedPaths: readonly string[] = [],
): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
          return { exitCode: 0, stdout: defaultBaseRef, stderr: "" };
        }
        const lastArg = args.at(-1);
        if (lastArg === defaultBaseRef) {
          return { exitCode: 0, stdout: defaultBaseSha, stderr: "" };
        }
        if (lastArg !== undefined && lastArg !== headSha && args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
          return { exitCode: 0, stdout: explicitBaseSha, stderr: "" };
        }
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
      },
    },
  };
}

function renameGitRunner(oldPath: string, newPath: string): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
          return { exitCode: 0, stdout: defaultBaseRef, stderr: "" };
        }
        const lastArg = args.at(-1);
        if (lastArg === defaultBaseRef) {
          return { exitCode: 0, stdout: defaultBaseSha, stderr: "" };
        }
        if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
          return { exitCode: 0, stdout: `${GIT_RENAME_STATUS_EXAMPLE}\0${oldPath}\0${newPath}\0`, stderr: "" };
        }
        if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        return { exitCode: 0, stdout: headSha, stderr: "" };
      },
    },
  };
}

function unbornHeadGitRunner(changedPaths: readonly string[]): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        if (args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
          return { exitCode: 1, stdout: "", stderr: "unknown revision" };
        }
        if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
          return { exitCode: 0, stdout: nameStatusNulDelimited(changedPaths), stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
  };
}

function stagedSourceGitRunner(
  sourcePath: string,
  testPath: string,
  testContent: string,
): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
          return { exitCode: 0, stdout: defaultBaseRef, stderr: "" };
        }
        const lastArg = args.at(-1);
        if (lastArg === defaultBaseRef) {
          return { exitCode: 0, stdout: defaultBaseSha, stderr: "" };
        }
        if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
          return { exitCode: 0, stdout: nameStatusNulDelimited([sourcePath]), stderr: "" };
        }
        if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
          return { exitCode: 0, stdout: nulDelimited([testPath]), stderr: "" };
        }
        if (args.includes(CHANGED_TEST_SHOW_COMMAND)) {
          return { exitCode: 0, stdout: testContent, stderr: "" };
        }
        return { exitCode: 0, stdout: headSha, stderr: "" };
      },
    },
  };
}

function stagedSourceCandidatesGitRunner(
  sourcePaths: readonly string[],
  candidateContents: ReadonlyMap<string, string>,
): RecordingGitRunner {
  const calls: GitCall[] = [];
  return {
    calls,
    git: {
      execa: async (command, args) => {
        calls.push({ command, args });
        if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
          return { exitCode: 0, stdout: defaultBaseRef, stderr: "" };
        }
        const lastArg = args.at(-1);
        if (lastArg === defaultBaseRef) {
          return { exitCode: 0, stdout: defaultBaseSha, stderr: "" };
        }
        if (args.includes(CHANGED_TEST_DIFF_COMMAND)) {
          return { exitCode: 0, stdout: nameStatusNulDelimited(sourcePaths), stderr: "" };
        }
        if (args.includes(CHANGED_TEST_LS_FILES_COMMAND)) {
          return { exitCode: 0, stdout: nulDelimited([...candidateContents.keys()]), stderr: "" };
        }
        if (args.includes(CHANGED_TEST_SHOW_COMMAND)) {
          const path = args.find((arg) => arg.startsWith(CHANGED_TEST_INDEX_PATH_PREFIX))?.slice(1) ?? "";
          return { exitCode: 0, stdout: candidateContents.get(path) ?? "", stderr: "" };
        }
        return { exitCode: 0, stdout: headSha, stderr: "" };
      },
    },
  };
}

function descriptorWithRelatedTests(
  testPaths: readonly string[],
  resolvedSourcePaths: readonly string[],
): TestingLanguageDescriptor {
  return {
    ...typescriptTestingLanguage,
    relatedTestPaths: (_request: RelatedTestRequest) => Promise.resolve({ testPaths, resolvedSourcePaths }),
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
    readFile: () => Promise.resolve(""),
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

async function noRunTests(_request: TestRunRequest): Promise<TestRunInvocation> {
  return { invoked: false };
}

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
      [nodeOperand(enablerNodePath), nodeOperand(outcomeNodePath)].sort(compareAsciiStrings),
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

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
      {
        git: git.git,
        registry: registry([language]),
        relatedDepsFor: () => relatedDeps(),
      },
    );

    expect(plan.targets).toEqual({ operands: [relatedTestPath], recursive: false });
    expect(plan.unresolvedSourceFiles).toEqual([]);
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

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
      {
        git: git.git,
        registry: registry([language]),
        relatedDepsFor: () => relatedDeps(),
      },
    );

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
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const relatedTestPath = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
    );
    const git = recordingGitRunner([], [sourcePath]);
    const language = {
      ...descriptorWithRelatedTests([relatedTestPath], [sourcePath]),
      runTests: noRunTests,
    };

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
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

  it("selects a node operand for an untracked spec-tree test file", async () => {
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const git = recordingGitRunner([], [testPath]);

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
      { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({ operands: [nodeOperand(nodePath)], recursive: false });
    expect(plan.changedPaths).toEqual([testPath]);
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

    expect(plan.changedPaths).toEqual([oldPath, newPath].sort(compareAsciiStrings));
    expect(plan.unresolvedSourceFiles).toEqual([oldPath, newPath].sort(compareAsciiStrings));
  });

  it("routes changed testing harness files through related-test resolution", async () => {
    const sourcePath = "testing/harnesses/with-git-env.ts";
    const testPath = "spx/21-infrastructure.enabler/43-precommit.enabler/tests/precommit.scenario.l2.test.ts";
    const git = stagedSourceGitRunner(
      sourcePath,
      testPath,
      `import { withGitEnv } from "@testing/harnesses/with-git-env";

withGitEnv;
`,
    );

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
      { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({ operands: [testPath], recursive: false });
    expect(plan.unresolvedSourceFiles).toEqual([]);
  });

  it("routes indirectly imported source files through related-test resolution", async () => {
    const sourcePath = "src/commands/test/changed-set-planning.ts";
    const helperPath = "spx/41-test.enabler/tests/helpers/changed-source-helper.ts";
    const testPath = "spx/41-test.enabler/tests/test.scenario.l1.test.ts";
    const git = stagedSourceCandidatesGitRunner(
      [sourcePath],
      new Map([
        [
          testPath,
          `import { helper } from "./helpers/changed-source-helper";

helper;
`,
        ],
        [
          helperPath,
          `import { planChangedTestSelection } from "@/commands/test/changed-set-planning";

planChangedTestSelection;
`,
        ],
      ]),
    );

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
      { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({ operands: [testPath], recursive: false });
    expect(plan.unresolvedSourceFiles).toEqual([]);
  });

  it("resolves tsconfig alias directory imports to changed source index modules", async () => {
    const sourcePath = "src/commands/test/index.ts";
    const testPath = "spx/41-test.enabler/tests/test.scenario.l1.test.ts";
    const git = stagedSourceGitRunner(
      sourcePath,
      testPath,
      `import { runTests } from "@/commands/test";

runTests;
`,
    );

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
      { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({ operands: [testPath], recursive: false });
    expect(plan.unresolvedSourceFiles).toEqual([]);
  });

  it.each([
    ["scripts/release.ts", "@scripts/release"],
    ["eslint-rules/no-legacy.ts", "@eslint-rules/no-legacy"],
  ])("routes changed alias source root %s through related-test resolution", async (sourcePath, importSpecifier) => {
    const testPath = "spx/41-test.enabler/tests/test.scenario.l1.test.ts";
    const git = stagedSourceGitRunner(
      sourcePath,
      testPath,
      `import { subject } from "${importSpecifier}";

subject;
`,
    );

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
      { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({ operands: [testPath], recursive: false });
    expect(plan.unresolvedSourceFiles).toEqual([]);
  });

  it("does not select unrelated testing harness consumers for changed harness sources", async () => {
    const precommitTestPath = "spx/21-infrastructure.enabler/43-precommit.enabler/tests/precommit.scenario.l2.test.ts";
    const cliTestPath = "spx/41-test.enabler/tests/test.scenario.l1.test.ts";
    const worktreeTestPath = "spx/38-worktree.enabler/43-worktree-cli.enabler/tests/worktree-cli.compliance.l2.test.ts";
    const sessionTestPath = "spx/36-session.enabler/76-session-cli.enabler/tests/session-cli.compliance.l2.test.ts";
    const git = stagedSourceCandidatesGitRunner(
      ["testing/harnesses/with-git-env.ts", "testing/harnesses/testing/cli.ts"],
      new Map([
        [precommitTestPath, `import { withGitEnv } from "@testing/harnesses/with-git-env";`],
        [cliTestPath, `import { runTestingCli } from "@testing/harnesses/testing/cli";`],
        [
          worktreeTestPath,
          `import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";`,
        ],
        [sessionTestPath, `import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";`],
      ]),
    );

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
      { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({
      operands: [precommitTestPath, cliTestPath].sort(compareAsciiStrings),
      recursive: false,
    });
    expect(plan.unresolvedSourceFiles).toEqual([]);
  });

  it("ignores changed paths outside the spec tree and source roots", () => {
    const nonSourcePath = sampleLiteralTestValue(arbitraryDomainLiteral());

    const partition = partitionChangedPaths([nonSourcePath]);

    expect(partition.operands).toEqual([]);
    expect(partition.sourceFiles).toEqual([]);
    expect(partition.configChanged).toBe(false);
  });

  it("selects the full spec tree when product config changes", async () => {
    const git = recordingGitRunner([CONFIG_FILENAMES.yaml]);

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()) },
      { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({ operands: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], recursive: true });
  });

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

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), baseRef: GIT_ROOT_COMMAND.HEAD },
      { git: git.git, registry: registry([]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.baseSha).toBe(EMPTY_TREE_SHA);
    expect(plan.targets).toEqual({ operands: [nodeOperand(nodePath)], recursive: false });
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
      [oldPath, newPath].sort(compareAsciiStrings),
    );
  });

  it("resolves staged source changes from test candidates and content in the index", async () => {
    const sourcePath = "src/math.ts";
    const testPath = "spx/10-math.enabler/tests/math.scenario.l1.test.ts";
    const git = stagedSourceGitRunner(
      sourcePath,
      testPath,
      `import { add } from "../../../src/math.js";

add(1, 1);
`,
    );

    const plan = await planChangedTestSelection(
      { productDir: sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()), staged: true },
      { git: git.git, registry: registry([typescriptTestingLanguage]), relatedDepsFor: () => relatedDeps() },
    );

    expect(plan.targets).toEqual({ operands: [testPath], recursive: false });
    expect(plan.unresolvedSourceFiles).toEqual([]);
    expect(git.calls.some((call) => call.args.includes(CHANGED_TEST_LS_FILES_COMMAND))).toBe(true);
    expect(
      git.calls.some((call) =>
        call.args.includes(CHANGED_TEST_LS_FILES_COMMAND) && call.args.includes(CHANGED_TEST_NULL_DELIMITED_FLAG)
      ),
    ).toBe(true);
    expect(git.calls.some((call) => call.args.includes(`${CHANGED_TEST_INDEX_PATH_PREFIX}${testPath}`))).toBe(true);
  });
});
