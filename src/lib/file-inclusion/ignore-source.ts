import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { withoutGitEnvironment } from "@/git/environment";
import { findExecutableOnPath } from "@/lib/executable-on-path";

import type { IgnoreSourceOverrides } from "./types";

const GIT_EXECUTABLE = "git";
const GIT_LS_FILES_ARGS = {
  LS_FILES: "ls-files",
  CACHED: "--cached",
  OTHERS: "--others",
  EXCLUDE_STANDARD: "--exclude-standard",
  FULL_NAME: "--full-name",
  EXCLUDE_FROM: "--exclude-from",
  NULL_TERMINATED: "-z",
} as const;
const GIT_CONFIG_ARGS = {
  CONFIG: "config",
  TYPE_PATH: "--type=path",
  GET: "--get",
  CORE_EXCLUDES_FILE: "core.excludesFile",
} as const;
export const CORE_EXCLUDES_FILE_CONFIG_KEY = GIT_CONFIG_ARGS.CORE_EXCLUDES_FILE;
const GIT_REV_PARSE_ARGS = {
  REV_PARSE: "rev-parse",
  GIT_COMMON_DIR: "--git-common-dir",
} as const;
const INFO_EXCLUDE_RELATIVE_PATH = "info/exclude";
const PATH_SEGMENT_SEPARATOR = "/";
const CURRENT_DIRECTORY_PREFIX = ".";
const GIT_SCOPE_FAILURE_MESSAGE = "failed to read git scope";
export const GIT_MISSING_CONTEXT_MESSAGE = "missing git working tree";
const GIT_MISSING_EXECUTABLE_MESSAGE = "missing git executable";
const GIT_NOT_A_REPOSITORY_STDERR = "not a git repository";
const GIT_NOT_A_WORK_TREE_STDERR = "not a git work tree";

export const DEFAULT_IGNORE_SOURCE_OVERRIDES: IgnoreSourceOverrides = {
  noIgnore: false,
  noIgnoreVcs: false,
  ignoreFile: undefined,
};

export type IgnoreSourceReaderConfig = {
  readonly overrides?: Partial<IgnoreSourceOverrides>;
};

export type IgnoreSourceReader = {
  isInIncludedSet(relativePath: string): boolean;
  hasIncludedDescendant(relativePath: string): boolean;
  appliedOverrides(): IgnoreSourceOverrides;
};

export const EMPTY_IGNORE_READER: IgnoreSourceReader = {
  isInIncludedSet(): boolean {
    return false;
  },
  hasIncludedDescendant(): boolean {
    return false;
  },
  appliedOverrides(): IgnoreSourceOverrides {
    return DEFAULT_IGNORE_SOURCE_OVERRIDES;
  },
};

function normalizeOverrides(config: IgnoreSourceReaderConfig): IgnoreSourceOverrides {
  return {
    ...DEFAULT_IGNORE_SOURCE_OVERRIDES,
    ...config.overrides,
  };
}

function gitEnvironment(): NodeJS.ProcessEnv {
  return withoutGitEnvironment(process.env);
}

function gitExecutable(productDir: string): string {
  const executable = findExecutableOnPath(GIT_EXECUTABLE);
  if (executable === null) {
    throw new Error(`${GIT_SCOPE_FAILURE_MESSAGE} for ${productDir}: ${GIT_MISSING_EXECUTABLE_MESSAGE}`);
  }
  return executable;
}

function errorStderr(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("stderr" in error)) {
    return undefined;
  }
  const stderr = (error as { readonly stderr: unknown }).stderr;
  return typeof stderr === "string" ? stderr : undefined;
}

function isMissingGitWorkingTreeError(error: unknown): boolean {
  const stderr = errorStderr(error);
  return stderr !== undefined && (
    stderr.includes(GIT_NOT_A_REPOSITORY_STDERR) || stderr.includes(GIT_NOT_A_WORK_TREE_STDERR)
  );
}

function readGit(productDir: string, args: readonly string[]): string {
  if (!existsSync(productDir)) {
    throw new Error(`${GIT_SCOPE_FAILURE_MESSAGE} for ${productDir}: ${GIT_MISSING_CONTEXT_MESSAGE}`);
  }
  try {
    return execFileSync(gitExecutable(productDir), [...args], {
      cwd: productDir,
      encoding: "utf8",
      env: gitEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (isMissingGitWorkingTreeError(err)) {
      throw new Error(`${GIT_SCOPE_FAILURE_MESSAGE} for ${productDir}: ${GIT_MISSING_CONTEXT_MESSAGE}`, {
        cause: err,
      });
    }
    throw new Error(`${GIT_SCOPE_FAILURE_MESSAGE} for ${productDir}`, { cause: err });
  }
}

function readGitScalar(productDir: string, args: readonly string[]): string {
  return stripTrailingLineTerminator(readGit(productDir, args));
}

function stripTrailingLineTerminator(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

function readOptionalGit(productDir: string, args: readonly string[]): string | undefined {
  try {
    return readGitScalar(productDir, args);
  } catch {
    return undefined;
  }
}

function excludeFromArgs(path: string): readonly string[] {
  return existsSync(path) ? [GIT_LS_FILES_ARGS.EXCLUDE_FROM, path] : [];
}

function resolveGitPath(productDir: string, path: string): string {
  return isAbsolute(path) ? path : join(productDir, path);
}

function readInfoExcludePath(productDir: string): string | undefined {
  const commonDir = readOptionalGit(productDir, [
    GIT_REV_PARSE_ARGS.REV_PARSE,
    GIT_REV_PARSE_ARGS.GIT_COMMON_DIR,
  ]);
  if (commonDir === undefined || commonDir.length === 0) {
    return undefined;
  }
  const absoluteCommonDir = resolveGitPath(productDir, commonDir);
  return join(absoluteCommonDir, INFO_EXCLUDE_RELATIVE_PATH);
}

function parentPrefixes(path: string): readonly string[] {
  const prefixes: string[] = [];
  let index = path.lastIndexOf(PATH_SEGMENT_SEPARATOR);
  while (index > 0) {
    const parent = path.slice(0, index);
    prefixes.push(parent);
    index = parent.lastIndexOf(PATH_SEGMENT_SEPARATOR);
  }
  return prefixes;
}

function includedDescendantParents(paths: ReadonlySet<string>): ReadonlySet<string> {
  const parents = new Set<string>();
  if (paths.size > 0) {
    parents.add("");
    parents.add(CURRENT_DIRECTORY_PREFIX);
  }
  for (const path of paths) {
    for (const parent of parentPrefixes(path)) {
      parents.add(parent);
    }
  }
  return parents;
}

function gitLsFilesArgs(productDir: string, overrides: IgnoreSourceOverrides): readonly string[] {
  const args: string[] = [
    GIT_LS_FILES_ARGS.LS_FILES,
    GIT_LS_FILES_ARGS.CACHED,
    GIT_LS_FILES_ARGS.OTHERS,
    GIT_LS_FILES_ARGS.FULL_NAME,
    GIT_LS_FILES_ARGS.NULL_TERMINATED,
  ];

  if (!overrides.noIgnore && !overrides.noIgnoreVcs) {
    args.push(GIT_LS_FILES_ARGS.EXCLUDE_STANDARD);
  }
  if (!overrides.noIgnore && overrides.ignoreFile !== undefined) {
    args.push(...excludeFromArgs(resolveGitPath(productDir, overrides.ignoreFile)));
  }
  if (!overrides.noIgnore && overrides.noIgnoreVcs) {
    const infoExcludePath = readInfoExcludePath(productDir);
    if (infoExcludePath !== undefined) {
      args.push(...excludeFromArgs(infoExcludePath));
    }
    const globalExcludesPath = readOptionalGit(productDir, [
      GIT_CONFIG_ARGS.CONFIG,
      GIT_CONFIG_ARGS.TYPE_PATH,
      GIT_CONFIG_ARGS.GET,
      GIT_CONFIG_ARGS.CORE_EXCLUDES_FILE,
    ]);
    if (globalExcludesPath !== undefined && globalExcludesPath.length > 0) {
      args.push(...excludeFromArgs(resolveGitPath(productDir, globalExcludesPath)));
    }
  }

  return args;
}

export function createIgnoreSourceReader(productDir: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader {
  const overrides = normalizeOverrides(config);
  const output = readGit(productDir, gitLsFilesArgs(productDir, overrides));
  const includedSet = new Set(output.split("\0").filter((line) => line.length > 0));
  const descendantParents = includedDescendantParents(includedSet);
  return {
    isInIncludedSet(relativePath: string): boolean {
      return includedSet.has(relativePath);
    },
    hasIncludedDescendant(relativePath: string): boolean {
      return descendantParents.has(
        relativePath.endsWith(PATH_SEGMENT_SEPARATOR)
          ? relativePath.slice(0, -1)
          : relativePath,
      );
    },
    appliedOverrides(): IgnoreSourceOverrides {
      return overrides;
    },
  };
}
