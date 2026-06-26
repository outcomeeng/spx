import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { createIgnoreSourceReader, DEFAULT_IGNORE_SOURCE_OVERRIDES } from "./ignore-source";
import type { IgnoreSourceReader } from "./ignore-source";
import { LAYER_SEQUENCE } from "./layer-sequence";
import type {
  LayerDecision,
  LayerEntry,
  ScopeEntry,
  ScopeRequest,
  ScopeResolverConfig,
  ScopeResolverState,
  ScopeResult,
} from "./types";

export type {
  LayerDecision,
  LayerEntry,
  ScopeEntry,
  ScopeRequest,
  ScopeResolverConfig,
  ScopeResolverState,
  ScopeResult,
} from "./types";

export const EXPLICIT_OVERRIDE_LAYER = "explicit-override" as const;
export const GIT_INTERNAL_DIRECTORY = ".git";

type LayerPair = {
  readonly entry: LayerEntry;
  readonly layerConfig: unknown;
};

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

async function isDirectory(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch (err) {
    if (isNodeError(err) && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return false;
    }
    throw err;
  }
}

async function readDirectoryEntries(absoluteDir: string): Promise<readonly Dirent<string>[]> {
  try {
    return await readdir(absoluteDir, { withFileTypes: true });
  } catch (err) {
    if (isNodeError(err) && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return [];
    }
    throw err;
  }
}

function normalizeProductPath(productDir: string, absolutePath: string): string {
  const rel = relative(productDir, absolutePath);
  return sep === "/" ? rel : rel.split(sep).join("/");
}

function shouldWalkEntry(
  entry: Dirent<string>,
  relativePath: string,
  ignoreReader: IgnoreSourceReader,
  pruneGitOpaqueDirectories: boolean,
): boolean {
  if (entry.name === GIT_INTERNAL_DIRECTORY) return false;
  if (!entry.isDirectory()) return true;
  return !pruneGitOpaqueDirectories || ignoreReader.hasIncludedDescendant(relativePath);
}

async function collectPaths(
  absoluteDir: string,
  productDir: string,
  result: string[],
  ignoreReader: IgnoreSourceReader,
  pruneGitOpaqueDirectories: boolean,
): Promise<void> {
  const dirEntries = await readDirectoryEntries(absoluteDir);
  for (const entry of dirEntries) {
    const absolutePath = join(absoluteDir, entry.name);
    const relativePath = normalizeProductPath(productDir, absolutePath);
    if (!shouldWalkEntry(entry, relativePath, ignoreReader, pruneGitOpaqueDirectories)) continue;
    if (entry.isDirectory()) {
      await collectPaths(absolutePath, productDir, result, ignoreReader, pruneGitOpaqueDirectories);
    } else if (entry.isFile()) {
      result.push(relativePath);
    }
  }
}

export async function resolveScope(
  productDir: string,
  request: ScopeRequest,
  config: ScopeResolverConfig,
): Promise<ScopeResult> {
  const ignoreReader = createIgnoreSourceReader(productDir, {
    overrides: request.overrides ?? DEFAULT_IGNORE_SOURCE_OVERRIDES,
  });
  return runPipeline(LAYER_SEQUENCE, productDir, request, config, ignoreReader);
}

export async function runPipeline(
  sequence: readonly LayerEntry[],
  productDir: string,
  request: ScopeRequest,
  config: ScopeResolverConfig,
  ignoreReader: IgnoreSourceReader,
): Promise<ScopeResult> {
  const resolverState: ScopeResolverState = { request, config, ignoreReader };
  const layerPairs: LayerPair[] = sequence.map((entry) => ({
    entry,
    layerConfig: entry.extractState(resolverState),
  }));

  const included: ScopeEntry[] = [];
  const excluded: ScopeEntry[] = [];

  const explicitPaths = request.explicit ?? [];
  const explicitPathSet = new Set<string>();

  for (const path of explicitPaths) {
    await addExplicitPath(path, productDir, ignoreReader, explicitPathSet, included);
  }

  if (request.walkRoot !== undefined) {
    const allPaths: string[] = [];
    await collectPaths(request.walkRoot, productDir, allPaths, ignoreReader, true);

    for (const path of allPaths) {
      if (explicitPathSet.has(path)) continue;
      const classified = classifyPath(path, layerPairs);
      if (classified.excluded) {
        excluded.push(classified.entry);
      } else {
        included.push(classified.entry);
      }
    }
  }

  return { included, excluded };
}

async function addExplicitPath(
  path: string,
  productDir: string,
  ignoreReader: IgnoreSourceReader,
  explicitPathSet: Set<string>,
  included: ScopeEntry[],
): Promise<void> {
  addExplicitEntry(path, explicitPathSet, included);
  const absolutePath = join(productDir, path);
  if (!await isDirectory(absolutePath)) return;
  const descendantPaths: string[] = [];
  await collectPaths(absolutePath, productDir, descendantPaths, ignoreReader, false);
  for (const descendantPath of descendantPaths) {
    addExplicitEntry(descendantPath, explicitPathSet, included);
  }
}

function addExplicitEntry(path: string, explicitPathSet: Set<string>, included: ScopeEntry[]): void {
  if (explicitPathSet.has(path)) return;
  explicitPathSet.add(path);
  included.push({
    path,
    decisionTrail: [{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }],
  });
}

function classifyPath(path: string, layerPairs: readonly LayerPair[]): { excluded: boolean; entry: ScopeEntry } {
  const trail = decisionTrailForPath(path, layerPairs);
  return {
    excluded: trail.length > 0,
    entry: { path, decisionTrail: trail },
  };
}

function decisionTrailForPath(path: string, layerPairs: readonly LayerPair[]): readonly LayerDecision[] {
  const trail: LayerDecision[] = [];
  for (const { entry, layerConfig } of layerPairs) {
    const decision = entry.predicate(path, layerConfig);
    if (decision.matched) {
      trail.push(decision);
    }
  }
  return trail;
}
