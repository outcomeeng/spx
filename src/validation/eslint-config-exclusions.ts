import * as JSONC from "jsonc-parser";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join } from "node:path";

import { CONFIG_PROCESS_CWD } from "../lib/config/cwd";

const GLOB_MARKER = "*";
const FILE_EXTENSION_PATTERN = /\.[^/]+$/;
const TYPE_SCRIPT_EXCLUDE_TREE_GLOB = "/**/*";

interface TypeScriptConfigFile {
  readonly exclude?: readonly string[];
  readonly extends?: string | readonly string[];
}

export function readTypeScriptExcludeGlobs(configFile: string): string[] {
  return [...new Set(readTypeScriptExclusions(configFile).map(toTypeScriptExcludeGlob))];
}

function resolveTypeScriptConfigPath(configFile: string, baseDir: string = CONFIG_PROCESS_CWD.read()): string {
  return isAbsolute(configFile) ? configFile : join(baseDir, configFile);
}

function resolveExtendedTypeScriptConfigPath(configFile: string, extendedConfigFile: string): string {
  if (!extendedConfigFile.startsWith(".") && !isAbsolute(extendedConfigFile)) {
    return createRequire(configFile).resolve(extendedConfigFile);
  }

  return resolveTypeScriptConfigPath(extendedConfigFile, dirname(configFile));
}

function normalizeTypeScriptExtends(value: TypeScriptConfigFile["extends"]): readonly string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

function toTypeScriptExcludeGlob(path: string): string {
  return path.endsWith(TYPE_SCRIPT_EXCLUDE_TREE_GLOB)
      || path.includes(GLOB_MARKER)
      || FILE_EXTENSION_PATTERN.test(basename(path))
    ? path
    : `${path}${TYPE_SCRIPT_EXCLUDE_TREE_GLOB}`;
}

function readTypeScriptConfigFile(resolvedConfigFile: string): TypeScriptConfigFile {
  try {
    const configContent = readFileSync(resolvedConfigFile, "utf-8");
    return JSONC.parse(configContent) as TypeScriptConfigFile;
  } catch (error) {
    throw new Error(
      `Unable to read TypeScript config for ESLint exclusions: ${resolvedConfigFile}`,
      { cause: error },
    );
  }
}

/**
 * Read TypeScript exclusions to maintain perfect scope alignment.
 * Follows `extends` so derived configs inherit base exclusions such as `dist`.
 */
function readTypeScriptExclusions(configFile: string, seen: ReadonlySet<string> = new Set()): string[] {
  const resolvedConfigFile = resolveTypeScriptConfigPath(configFile);
  if (seen.has(resolvedConfigFile)) {
    return [];
  }

  const nextSeen = new Set(seen).add(resolvedConfigFile);
  const config = readTypeScriptConfigFile(resolvedConfigFile);
  const ownExcludes = [...(config.exclude ?? [])];
  const baseExcludes = normalizeTypeScriptExtends(config.extends)
    .flatMap((value) => {
      const baseFile = resolveExtendedTypeScriptConfigPath(resolvedConfigFile, value);
      return readTypeScriptExclusions(baseFile, nextSeen);
    });
  if (baseExcludes.length > 0) {
    return [...baseExcludes, ...ownExcludes];
  }
  return ownExcludes;
}
