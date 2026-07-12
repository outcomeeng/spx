import {
  CHANGED_TEST_DIFF_CACHED_FLAG,
  CHANGED_TEST_DIFF_COMMAND,
  CHANGED_TEST_DIFF_NAME_STATUS_FLAG,
  CHANGED_TEST_INDEX_PATH_PREFIX,
  CHANGED_TEST_LS_FILES_CACHED_FLAG,
  CHANGED_TEST_LS_FILES_COMMAND,
  CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG,
  CHANGED_TEST_LS_FILES_OTHERS_FLAG,
  CHANGED_TEST_NULL_DELIMITED_FLAG,
  CHANGED_TEST_SHOW_COMMAND,
} from "@/commands/test/changed-set-planning";
import { GIT_DELETE_STATUS_EXAMPLE } from "@/lib/git/name-status";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
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
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { CHANGED_SET_PLANNING_GENERATOR } from "@testing/generators/testing/changed-set-planning";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";

export const defaultBranchName = sampleLiteralTestValue(arbitraryDomainLiteral());
export const defaultBaseRef = [GIT_ROOT_COMMAND.ORIGIN, defaultBranchName].join("/");
export const defaultBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
export const explicitBaseSha = sampleLiteralTestValue(arbitraryDomainLiteral());
export const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());

export interface GitCall {
  readonly command: string;
  readonly args: readonly string[];
}

export interface RecordingGitRunner {
  readonly calls: readonly GitCall[];
  readonly git: GitDependencies;
}

export interface RecordingRelatedTestDescriptor {
  readonly calls: readonly RelatedTestRequest[];
  readonly language: TestingLanguageDescriptor;
}

export interface StagedSnapshotGitOptions {
  readonly changedPaths: readonly string[];
  readonly stagedFiles?: ReadonlyMap<string, string>;
  readonly failedStagedFiles?: ReadonlyMap<string, string>;
  readonly dirtyWorktreePaths?: readonly string[];
  readonly untrackedWorktreePaths?: readonly string[];
  readonly trackedStagedPaths?: readonly string[];
  readonly resolvedHeadSha?: string;
}

export interface GitCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type GitCommandHandler = (
  command: string,
  args: readonly string[],
) => GitCommandResult | Promise<GitCommandResult>;

export function nulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${path}\0`).join("");
}

export function nameStatusNulDelimited(paths: readonly string[]): string {
  return paths.map((path) => `${GIT_DELETE_STATUS_EXAMPLE}\0${path}\0`).join("");
}

export function gitRunner(handler: GitCommandHandler): RecordingGitRunner {
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

export function defaultGitCommandResult(
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

export function recordingGitRunner(
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

export function stagedSnapshotGit(options: StagedSnapshotGitOptions): GitDependencies {
  return gitRunner((_command, args) => {
    if (args.includes(GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF)) {
      return { exitCode: 0, stdout: defaultBaseRef, stderr: "" };
    }
    const lastArg = args.at(-1);
    if (lastArg === defaultBaseRef) {
      return { exitCode: 0, stdout: defaultBaseSha, stderr: "" };
    }
    if (args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
      return { exitCode: 0, stdout: options.resolvedHeadSha ?? headSha, stderr: "" };
    }
    if (
      args.includes(CHANGED_TEST_DIFF_COMMAND)
      && args.includes(CHANGED_TEST_DIFF_CACHED_FLAG)
      && args.includes(CHANGED_TEST_DIFF_NAME_STATUS_FLAG)
    ) {
      return { exitCode: 0, stdout: nameStatusNulDelimited(options.changedPaths), stderr: "" };
    }
    if (
      args.includes(CHANGED_TEST_DIFF_COMMAND)
      && args.includes(CHANGED_TEST_DIFF_NAME_STATUS_FLAG)
      && args.includes(CHANGED_TEST_NULL_DELIMITED_FLAG)
    ) {
      return {
        exitCode: 0,
        stdout: nameStatusNulDelimited(options.dirtyWorktreePaths ?? []),
        stderr: "",
      };
    }
    if (
      args.includes(CHANGED_TEST_LS_FILES_COMMAND)
      && args.includes(CHANGED_TEST_LS_FILES_CACHED_FLAG)
      && args.includes(CHANGED_TEST_NULL_DELIMITED_FLAG)
    ) {
      return { exitCode: 0, stdout: nulDelimited(options.trackedStagedPaths ?? []), stderr: "" };
    }
    if (
      args.includes(CHANGED_TEST_LS_FILES_COMMAND)
      && args.includes(CHANGED_TEST_LS_FILES_OTHERS_FLAG)
      && args.includes(CHANGED_TEST_LS_FILES_EXCLUDE_STANDARD_FLAG)
      && args.includes(CHANGED_TEST_NULL_DELIMITED_FLAG)
    ) {
      return { exitCode: 0, stdout: nulDelimited(options.untrackedWorktreePaths ?? []), stderr: "" };
    }
    if (args.includes(CHANGED_TEST_SHOW_COMMAND)) {
      return stagedPathResult(options, args);
    }
    return { exitCode: 0, stdout: options.resolvedHeadSha ?? headSha, stderr: "" };
  }).git;
}

function stagedPathResult(
  options: StagedSnapshotGitOptions,
  args: readonly string[],
): GitCommandResult {
  const path = args.find((arg) => arg.startsWith(CHANGED_TEST_INDEX_PATH_PREFIX))?.slice(1) ?? "";
  const failure = options.failedStagedFiles?.get(path);
  if (failure !== undefined) {
    return { exitCode: 1, stdout: "", stderr: failure };
  }
  const content = options.stagedFiles?.get(path);
  return content === undefined
    ? { exitCode: 1, stdout: "", stderr: CHANGED_SET_PLANNING_GENERATOR.content().gitStagedPathMissingMessage }
    : { exitCode: 0, stdout: content, stderr: "" };
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

export function descriptorResolvingWithoutTests(
  resolvedSourcePaths: readonly string[],
): TestingLanguageDescriptor {
  return {
    ...typescriptTestingLanguage,
    relatedTestPaths: () => Promise.resolve({ testPaths: [], resolvedSourcePaths }),
  };
}

export function recordingRelatedTestDescriptor(): RecordingRelatedTestDescriptor {
  const calls: RelatedTestRequest[] = [];
  return {
    calls,
    language: {
      ...typescriptTestingLanguage,
      relatedTestPaths: (request: RelatedTestRequest) => {
        calls.push(request);
        return Promise.resolve({ testPaths: [], resolvedSourcePaths: [] });
      },
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
    readFile: (path) =>
      Promise.resolve(
        path === TYPESCRIPT_MARKER ? CHANGED_SET_PLANNING_GENERATOR.content().emptyTsconfig : "",
      ),
  };
}

export async function noRunTests(_request: TestRunRequest): Promise<TestRunInvocation> {
  return { invoked: false };
}
