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

export { LayerEntry, ScopeEntry, ScopeRequest, ScopeResolverConfig, ScopeResult };
export type { LayerContext, LayerDecision };

export const EXPLICIT_OVERRIDE_LAYER = "explicit-override" as const;

async function collectPaths(
  absoluteDir: string,
  projectRoot: string,
  result: string[],
  artifactDirs: ReadonlySet<string>,
): Promise<void> {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
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
  const layerPairs = sequence.map((entry) => ({
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

      const trail: LayerDecision[] = [];
      for (const { entry, layerConfig } of layerPairs) {
        const decision = entry.predicate(path, layerConfig);
        if (decision.matched) {
          trail.push(decision);
        }
      }

      if (trail.length > 0) {
        excluded.push({ path, decisionTrail: trail });
      } else {
        included.push({ path, decisionTrail: [] });
      }
    }
  }

  return { included, excluded };
}
