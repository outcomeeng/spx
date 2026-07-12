import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader, DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";
import { LAYER_SEQUENCE } from "@/lib/file-inclusion/layer-sequence";
import { EXPLICIT_OVERRIDE_LAYER, resolveScope, runPipeline } from "@/lib/file-inclusion/pipeline";
import type { LayerEntry, ScopeEntry, ScopeResult } from "@/lib/file-inclusion/pipeline";
import type { LayerDecision } from "@/lib/file-inclusion/types";
import { compareAsciiStrings } from "@/lib/state-store";
import { arbitrarySourceFilePath } from "@testing/generators/literal/literal";

import { sampleLayerName } from "@testing/harnesses/file-inclusion/path-predicates";
import {
  makeResolverState,
  PROPERTY_NUM_RUNS,
  resolverConfig,
  scopeResolverFixture,
  writeScopeResolverFixture,
} from "@testing/harnesses/file-inclusion/scope-resolver";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

function normalizeScopeEntries(entries: readonly ScopeEntry[]): readonly ScopeEntry[] {
  return [...entries].sort((a, b) => compareAsciiStrings(a.path, b.path));
}

function normalizeScopeResult(result: ScopeResult): ScopeResult {
  return {
    included: normalizeScopeEntries(result.included),
    excluded: normalizeScopeEntries(result.excluded),
    appliedOverrides: result.appliedOverrides,
  };
}

describe("scope resolver — properties", () => {
  it("resolution is deterministic for equal worktree, request, and filesystem state", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);
      await fc.assert(
        fc.asyncProperty(fc.array(arbitrarySourceFilePath()), async (explicitPaths) => {
          const request = explicitPaths.length > 0
            ? {
              explicit: explicitPaths,
              walkRoot: env.productDir,
              domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
              overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
            }
            : {
              walkRoot: env.productDir,
              domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
              overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
            };
          const first = await resolveScope(env.productDir, request, resolverConfig);
          const second = await resolveScope(env.productDir, request, resolverConfig);
          expect(normalizeScopeResult(second)).toEqual(normalizeScopeResult(first));
        }),
        { numRuns: PROPERTY_NUM_RUNS },
      );
    });
  });

  it("explicit-override holds universally for caller-supplied explicit paths", async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySourceFilePath(), async (path) => {
        await withGitWorktreeEnv(async (env) => {
          const result = await resolveScope(
            env.productDir,
            { explicit: [path], overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES },
            resolverConfig,
          );
          const entry = result.included.find((e) => e.path === path);
          expect(entry, `scope.resolver.property absent from scope.included: ${path}`).toBeDefined();
          expect(entry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("excluded decision trails are complete and layer-ordered", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);
      const result = await resolveScope(
        env.productDir,
        {
          walkRoot: env.productDir,
          domainPathFilter: { exclude: [fixture.ignoredFilePath] },
          overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
        },
        resolverConfig,
      );
      const state = makeResolverState({ domainPathFilter: { exclude: [fixture.ignoredFilePath] } });
      const layerIndexMap = new Map<string, number>(
        LAYER_SEQUENCE.map((entry, index): [string, number] => {
          const sample = entry.predicate(fixture.ignoredFilePath, entry.extractState(state));
          return [sample.layer, index];
        }),
      );
      const knownLayers = new Set(layerIndexMap.keys());
      for (const excluded of result.excluded) {
        expect(excluded.decisionTrail.length, `${excluded.path} must have non-empty trail`).toBeGreaterThan(0);
        let lastIndex = -1;
        for (const decision of excluded.decisionTrail) {
          expect(knownLayers.has(decision.layer), `"${decision.layer}" must be a known layer`).toBe(true);
          const layerIdx = layerIndexMap.get(decision.layer) ?? -1;
          expect(layerIdx, `trail entry "${decision.layer}" in "${excluded.path}" must follow sequence order`)
            .toBeGreaterThan(lastIndex);
          lastIndex = layerIdx;
        }
      }
      const multiMatch = result.excluded.find((e) => e.path === fixture.ignoredFilePath);
      expect(multiMatch, `scope.resolver.property: "${fixture.ignoredFilePath}" absent from excluded`).toBeDefined();
      expect(multiMatch!.decisionTrail.length, "multi-layer path must carry a trail entry per matching layer")
        .toBeGreaterThan(1);
    });
  });

  it("a noop layer inserted at any position leaves existing included and excluded decisions unchanged", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const noopLayer: LayerEntry = {
        predicate: (_path: string): LayerDecision => ({ matched: false, layer: sampleLayerName() }),
        extractState: () => ({}),
      };

      const request = {
        walkRoot: env.productDir,
        domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
        overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
      };
      const baseResult = await resolveScope(env.productDir, request, resolverConfig);
      const baseExcluded = new Map(baseResult.excluded.map((e) => [e.path, e]));
      const ignoreReader = createIgnoreSourceReader(env.productDir, { overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES });

      for (let position = 0; position <= LAYER_SEQUENCE.length; position += 1) {
        const extended = [
          ...LAYER_SEQUENCE.slice(0, position),
          noopLayer,
          ...LAYER_SEQUENCE.slice(position),
        ];
        const extResult = await runPipeline(extended, env.productDir, request, resolverConfig, ignoreReader);

        expect(
          extResult.included.map((e) => e.path).sort(compareAsciiStrings),
          `position ${position}: included set unchanged`,
        ).toEqual(baseResult.included.map((e) => e.path).sort(compareAsciiStrings));
        expect(
          extResult.excluded.map((e) => e.path).sort(compareAsciiStrings),
          `position ${position}: excluded set unchanged`,
        ).toEqual(baseResult.excluded.map((e) => e.path).sort(compareAsciiStrings));
        for (const extEntry of extResult.excluded) {
          const baseEntry = baseExcluded.get(extEntry.path);
          expect(extEntry.decisionTrail, `position ${position}: trail for "${extEntry.path}" must be unchanged`)
            .toEqual(baseEntry!.decisionTrail);
        }
      }
    });
  });

  it("a matching custom layer inserted at position p adds exactly one trail entry for matched paths", async () => {
    await withGitWorktreeEnv(async (env) => {
      const fixture = scopeResolverFixture();
      await writeScopeResolverFixture(env, fixture);

      const customLayerName = sampleLayerName();
      const customLayer: LayerEntry = {
        predicate: (path: string): LayerDecision => ({
          matched: path === fixture.trackedFilePath,
          layer: customLayerName,
        }),
        extractState: () => ({}),
      };

      const request = {
        walkRoot: env.productDir,
        domainPathFilter: { exclude: [fixture.domainExcludePrefix] },
        overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES,
      };
      const baseResult = await resolveScope(env.productDir, request, resolverConfig);
      const baseExcluded = new Map(baseResult.excluded.map((e) => [e.path, e]));
      const ignoreReader = createIgnoreSourceReader(env.productDir, { overrides: DEFAULT_IGNORE_SOURCE_OVERRIDES });

      for (let position = 0; position <= LAYER_SEQUENCE.length; position += 1) {
        const extended = [
          ...LAYER_SEQUENCE.slice(0, position),
          customLayer,
          ...LAYER_SEQUENCE.slice(position),
        ];
        const extResult = await runPipeline(extended, env.productDir, request, resolverConfig, ignoreReader);

        const customExcluded = extResult.excluded.find((e) => e.path === fixture.trackedFilePath);
        expect(customExcluded, `position ${position}: ${fixture.trackedFilePath} should be excluded by custom layer`)
          .toBeDefined();

        const customTrailEntries = customExcluded!.decisionTrail.filter((d) => d.layer === customLayerName);
        expect(customTrailEntries, `position ${position}: trail must name "${customLayerName}" exactly once`)
          .toHaveLength(1);

        const domainExcluded = extResult.excluded.find((e) => e.path === fixture.domainExcludedPath);
        expect(domainExcluded, `position ${position}: ${fixture.domainExcludedPath} still excluded`).toBeDefined();

        const gitExcluded = extResult.excluded.find((e) => e.path === fixture.ignoredFilePath);
        expect(gitExcluded, `position ${position}: ${fixture.ignoredFilePath} still excluded`).toBeDefined();

        for (const extEntry of extResult.excluded) {
          const baseEntry = baseExcluded.get(extEntry.path);
          if (baseEntry) {
            expect(extEntry.decisionTrail, `position ${position}: trail for "${extEntry.path}" must be unchanged`)
              .toEqual(baseEntry.decisionTrail);
          }
        }
      }
    });
  });
});
