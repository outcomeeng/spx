import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { createIgnoreSourceReader } from "./ignore-source";
import type { IgnoreSourceReader } from "./ignore-source";
import { LAYER_SEQUENCE } from "./layer-sequence";
import type {
  LayerContext,
  LayerDecision,
  LayerEntry,
  ScopeEntry,
  ScopeRequest,
  ScopeResolverConfig,
  ScopeResult,
} from "./types";

export type {
  LayerContext,
  LayerDecision,
  LayerEntry,
  ScopeEntry,
  ScopeRequest,
  ScopeResolverConfig,
  ScopeResult,
} from "./types";

export const EXPLICIT_OVERRIDE_LAYER = "explicit-override" as const;

type LayerPair = {
  readonly entry: LayerEntry;
  readonly layerConfig: unknown;
};

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

async function collectPaths(
  absoluteDir: string,
  projectRoot: string,
  result: string[],
  artifactDirs: ReadonlySet<string>,
): Promise<void> {
  let dirEntries: Dirent<string>[];
  try {
    dirEntries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (err) {
    if (isNodeError(err) && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return;
    }
    throw err;
  }
  for (const entry of dirEntries) {
    if (entry.isDirectory()) {
      if (artifactDirs.has(entry.name)) continue;
      const absolutePath = join(absoluteDir, entry.name);
      await collectPaths(absolutePath, projectRoot, result, artifactDirs);
    } else if (entry.isFile()) {
      const absolutePath = join(absoluteDir, entry.name);
      const rel = relative(projectRoot, absolutePath);
      result.push(sep === "/" ? rel : rel.split(sep).join("/"));
    }
  }
}

export async function resolveScope(
  projectRoot: string,
  request: ScopeRequest,
  config: ScopeResolverConfig,
): Promise<ScopeResult> {
  const ignoreReader = createIgnoreSourceReader(projectRoot, {
    ignoreSourceFilename: config.ignoreSourceFilename,
    specTreeRootSegment: config.specTreeRootSegment,
  });
  return runPipeline(LAYER_SEQUENCE, projectRoot, request, config, ignoreReader);
}

export async function runPipeline(
  sequence: readonly LayerEntry[],
  projectRoot: string,
  request: ScopeRequest,
  config: ScopeResolverConfig,
  ignoreReader: IgnoreSourceReader,
): Promise<ScopeResult> {
  const layerCtx: LayerContext = { config, ignoreReader };
  const layerPairs: LayerPair[] = sequence.map((entry) => ({
    entry,
    layerConfig: entry.extractConfig(layerCtx),
  }));

  const included: ScopeEntry[] = [];
  const excluded: ScopeEntry[] = [];

  const explicitPaths = request.explicit ?? [];
  const explicitPathSet = new Set<string>(explicitPaths);

  for (const path of explicitPaths) {
    included.push({
      path,
      decisionTrail: [{ matched: true, layer: EXPLICIT_OVERRIDE_LAYER }],
    });
  }

  if (request.walkRoot !== undefined) {
    const artifactDirs = new Set(config.artifactDirectories);
    const allPaths: string[] = [];
    await collectPaths(request.walkRoot, projectRoot, allPaths, artifactDirs);

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
