import * as JSONC from "jsonc-parser";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const GLOB_MARKER = "*";
const TYPE_SCRIPT_EXCLUDE_TREE_GLOB = "/**/*";

interface TypeScriptConfigFile {
  readonly exclude?: readonly string[];
  readonly extends?: string | readonly string[];
}

export function readTypeScriptExcludeGlobs(configFile: string): string[] {
  return readTypeScriptExclusions(configFile).map(toTypeScriptExcludeGlob);
}

function resolveTypeScriptConfigPath(configFile: string, baseDir: string = process.cwd()): string {
  return isAbsolute(configFile) ? configFile : join(baseDir, configFile);
}

function resolveExtendedTypeScriptConfigPath(configFile: string, extendedConfigFile: string): string {
  const relativeConfigFile = extendedConfigFile.startsWith(".") || isAbsolute(extendedConfigFile)
    ? extendedConfigFile
    : `./${extendedConfigFile}`;

  return resolveTypeScriptConfigPath(relativeConfigFile, dirname(configFile));
}

function normalizeTypeScriptExtends(value: TypeScriptConfigFile["extends"]): readonly string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

function toTypeScriptExcludeGlob(path: string): string {
  return path.endsWith(TYPE_SCRIPT_EXCLUDE_TREE_GLOB) || path.includes(GLOB_MARKER)
    ? path
    : `${path}${TYPE_SCRIPT_EXCLUDE_TREE_GLOB}`;
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

  try {
    const nextSeen = new Set(seen).add(resolvedConfigFile);
    const configContent = readFileSync(resolvedConfigFile, "utf-8");
    const config = JSONC.parse(configContent) as TypeScriptConfigFile;
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
  } catch (error) {
    throw new Error(
      `Unable to read TypeScript config for ESLint exclusions: ${resolvedConfigFile}`,
      { cause: error },
    );
  }
}
