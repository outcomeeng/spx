import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { findExecutableOnPath } from "@/lib/executable-on-path";
import { withoutGitEnvironment } from "@/lib/git/environment";

import type { IgnoreSourceOverrides } from "./types";

const GIT_EXECUTABLE = "git";
export const GIT_LS_FILES_ARGS = {
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
export const GIT_GLOBAL_EXCLUDES_ENV_KEYS = {
  XDG_CONFIG_HOME: "XDG_CONFIG_HOME",
  HOME: "HOME",
} as const;
export const GIT_DEFAULT_GLOBAL_IGNORE_PATH = {
  CONFIG_DIRECTORY: ".config",
  GIT_DIRECTORY: "git",
  IGNORE_FILE: "ignore",
} as const;
const PATH_SEGMENT_SEPARATOR = "/";
const CURRENT_DIRECTORY_PREFIX = ".";
const GIT_SCOPE_FAILURE_MESSAGE = "failed to read git scope";
export const GIT_MISSING_CONTEXT_MESSAGE = "missing git working tree";
const GIT_MISSING_EXECUTABLE_MESSAGE = "missing git executable";
const GIT_NOT_A_REPOSITORY_STDERR = "not a git repository";
const GIT_NOT_A_WORK_TREE_STDERR = "not a git work tree";
const BYTES_PER_KIBIBYTE = 1024;
const GIT_SCOPE_BUFFER_MULTIPLIER = 64;
export const GIT_SCOPE_DEFAULT_NODE_MAX_BUFFER_BYTES = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;
export const GIT_SCOPE_MAX_BUFFER_BYTES = GIT_SCOPE_DEFAULT_NODE_MAX_BUFFER_BYTES * GIT_SCOPE_BUFFER_MULTIPLIER;

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

export const EMPTY_INCLUDED_SET_IGNORE_READER: IgnoreSourceReader = {
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
      maxBuffer: GIT_SCOPE_MAX_BUFFER_BYTES,
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
  return [GIT_LS_FILES_ARGS.EXCLUDE_FROM, path];
}

function optionalExcludeFromArgs(path: string): readonly string[] {
  return existsSync(path) ? excludeFromArgs(path) : [];
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

function defaultGlobalExcludesPath(env: NodeJS.ProcessEnv): string | undefined {
  const xdgConfigHome = env[GIT_GLOBAL_EXCLUDES_ENV_KEYS.XDG_CONFIG_HOME];
  if (xdgConfigHome !== undefined && xdgConfigHome.length > 0) {
    return join(
      xdgConfigHome,
      GIT_DEFAULT_GLOBAL_IGNORE_PATH.GIT_DIRECTORY,
      GIT_DEFAULT_GLOBAL_IGNORE_PATH.IGNORE_FILE,
    );
  }

  const home = env[GIT_GLOBAL_EXCLUDES_ENV_KEYS.HOME];
  if (home === undefined || home.length === 0) {
    return undefined;
  }
  return join(
    home,
    GIT_DEFAULT_GLOBAL_IGNORE_PATH.CONFIG_DIRECTORY,
    GIT_DEFAULT_GLOBAL_IGNORE_PATH.GIT_DIRECTORY,
    GIT_DEFAULT_GLOBAL_IGNORE_PATH.IGNORE_FILE,
  );
}

function readGlobalExcludesPath(productDir: string): string | undefined {
  const configuredPath = readOptionalGit(productDir, [
    GIT_CONFIG_ARGS.CONFIG,
    GIT_CONFIG_ARGS.TYPE_PATH,
    GIT_CONFIG_ARGS.GET,
    GIT_CONFIG_ARGS.CORE_EXCLUDES_FILE,
  ]);
  if (configuredPath !== undefined) {
    return configuredPath.length > 0 ? resolveGitPath(productDir, configuredPath) : undefined;
  }
  return defaultGlobalExcludesPath(gitEnvironment());
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

export function buildIgnoreSourceGitLsFilesArgs(
  productDir: string,
  overrides: Partial<IgnoreSourceOverrides> = DEFAULT_IGNORE_SOURCE_OVERRIDES,
): readonly string[] {
  const normalizedOverrides = normalizeOverrides({ overrides });
  const args: string[] = [
    GIT_LS_FILES_ARGS.LS_FILES,
    GIT_LS_FILES_ARGS.CACHED,
    GIT_LS_FILES_ARGS.OTHERS,
    GIT_LS_FILES_ARGS.FULL_NAME,
    GIT_LS_FILES_ARGS.NULL_TERMINATED,
  ];

  if (!normalizedOverrides.noIgnore && !normalizedOverrides.noIgnoreVcs) {
    args.push(GIT_LS_FILES_ARGS.EXCLUDE_STANDARD);
  }
  if (!normalizedOverrides.noIgnore && normalizedOverrides.ignoreFile !== undefined) {
    args.push(...excludeFromArgs(resolveGitPath(productDir, normalizedOverrides.ignoreFile)));
  }
  if (!normalizedOverrides.noIgnore && normalizedOverrides.noIgnoreVcs) {
    const infoExcludePath = readInfoExcludePath(productDir);
    if (infoExcludePath !== undefined) {
      args.push(...optionalExcludeFromArgs(infoExcludePath));
    }
    const globalExcludesPath = readGlobalExcludesPath(productDir);
    if (globalExcludesPath !== undefined) {
      args.push(...optionalExcludeFromArgs(globalExcludesPath));
    }
  }

  return args;
}

export function createIgnoreSourceReader(productDir: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader {
  const overrides = normalizeOverrides(config);
  const output = readGit(productDir, buildIgnoreSourceGitLsFilesArgs(productDir, overrides));
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
