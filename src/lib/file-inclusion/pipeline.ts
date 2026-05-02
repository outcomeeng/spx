import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { createIgnoreSourceReader } from "./ignore-source";
import type { IgnoreSourceReader } from "./ignore-source";
import { LAYER_SEQUENCE } from "./layer-sequence";
import type { LayerDecision, LayerEntry, ScopeEntry, ScopeRequest, ScopeResolverConfig, ScopeResult } from "./types";

export { LayerEntry, ScopeEntry, ScopeRequest, ScopeResolverConfig, ScopeResult };
export type { LayerDecision };

export const EXPLICIT_OVERRIDE_LAYER = "explicit-override" as const;

type PipelineConfig = ScopeResolverConfig & {
  readonly _ignoreReader: IgnoreSourceReader;
};

async function collectPaths(
  absoluteDir: string,
  projectRoot: string,
  result: string[],
): Promise<void> {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      await collectPaths(absolutePath, projectRoot, result);
    } else if (entry.isFile()) {
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
  return runPipeline(LAYER_SEQUENCE, projectRoot, request, config);
}

export async function runPipeline(
  sequence: readonly LayerEntry[],
  projectRoot: string,
  request: ScopeRequest,
  config: ScopeResolverConfig,
): Promise<ScopeResult> {
  const ignoreReader = createIgnoreSourceReader(projectRoot, {
    ignoreSourceFilename: config.ignoreSourceFilename,
    specTreeRootSegment: config.specTreeRootSegment,
  });
  const pipelineConfig: PipelineConfig = { ...config, _ignoreReader: ignoreReader };

  const layerPairs = sequence.map((entry) => ({
    entry,
    layerConfig: entry.extractConfig(pipelineConfig),
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
    const allPaths: string[] = [];
    await collectPaths(request.walkRoot, projectRoot, allPaths);

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
