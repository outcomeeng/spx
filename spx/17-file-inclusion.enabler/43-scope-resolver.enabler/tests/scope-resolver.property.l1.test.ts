import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { LAYER_SEQUENCE } from "@/lib/file-inclusion/layer-sequence";
import { EXPLICIT_OVERRIDE_LAYER, resolveScope, runPipeline } from "@/lib/file-inclusion/pipeline";
import type { LayerEntry } from "@/lib/file-inclusion/pipeline";
import type { LayerDecision } from "@/lib/file-inclusion/types";

import {
  artifactFilePath,
  cleanFilePath,
  excludedNodeSegment,
  hiddenFilePath,
  ignoredFilePath,
  integrationConfig,
  makeLayerContext,
  multiLayerFilePath,
  PROPERTY_NUM_RUNS,
  resolverConfig,
  writeExclude,
  writeTestFiles,
} from "./support";

describe("scope resolver — properties", () => {
  it("resolution is deterministic: same project root, request, and filesystem state produce the same ScopeResult on every call", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1 }).filter((s) => !s.startsWith("/") && !s.includes(".."))),
          async (explicitPaths) => {
            const request = explicitPaths.length > 0
              ? { explicit: explicitPaths, walkRoot: env.projectDir }
              : { walkRoot: env.projectDir };
            const first = await resolveScope(env.projectDir, request, resolverConfig);
            const second = await resolveScope(env.projectDir, request, resolverConfig);
            expect(first.included.map((e) => e.path).sort()).toEqual(second.included.map((e) => e.path).sort());
            expect(first.excluded.map((e) => e.path).sort()).toEqual(second.excluded.map((e) => e.path).sort());
          },
        ),
        { numRuns: PROPERTY_NUM_RUNS },
      );
    });
  });

  it("explicit-override holds universally: any caller-supplied explicit path appears in included with explicit-override as the first trail entry", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => !s.startsWith("/") && !s.includes("..")),
        async (path) => {
          await withTestEnv(integrationConfig, async (env) => {
            const result = await resolveScope(env.projectDir, { explicit: [path] }, resolverConfig);
            const entry = result.included.find((e) => e.path === path);
            expect(entry, `scope.resolver.property absent from scope.included: ${path}`).toBeDefined();
            expect(entry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("decision trails are complete and layer-ordered: every excluded path carries a non-empty trail whose entries name known layers in sequence order", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);
      const result = await resolveScope(env.projectDir, { walkRoot: env.projectDir }, resolverConfig);
      const dummyCtx = makeLayerContext(resolverConfig);
      const layerIndexMap = new Map<string, number>(
        LAYER_SEQUENCE.map((entry, index): [string, number] => {
          const sample = entry.predicate("x", entry.extractConfig(dummyCtx));
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
      // multiLayerFilePath matches both artifact-directory and hidden-prefix; its trail must have > 1 entry
      const multiMatch = result.excluded.find((e) => e.path === multiLayerFilePath);
      expect(multiMatch, `scope.resolver.property: "${multiLayerFilePath}" absent from excluded`).toBeDefined();
      expect(multiMatch!.decisionTrail.length, `multi-layer path must carry a trail entry per matching layer`)
        .toBeGreaterThan(1);
    });
  });

  it("layer-sequence extensibility: inserting a noop layer at any position leaves existing included/excluded decisions unchanged", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);

      const noopLayer: LayerEntry = {
        predicate: (_path: string): LayerDecision => ({ matched: false, layer: "noop-test" }),
        extractConfig: () => ({}),
      };

      const baseResult = await resolveScope(env.projectDir, { walkRoot: env.projectDir }, resolverConfig);
      const baseExcluded = new Map(baseResult.excluded.map((e) => [e.path, e]));
      const ignoreReader = createIgnoreSourceReader(env.projectDir, {
        ignoreSourceFilename: resolverConfig.ignoreSourceFilename,
        specTreeRootSegment: resolverConfig.specTreeRootSegment,
      });

      for (let position = 0; position <= LAYER_SEQUENCE.length; position++) {
        const extended = [
          ...LAYER_SEQUENCE.slice(0, position),
          noopLayer,
          ...LAYER_SEQUENCE.slice(position),
        ];
        const extResult = await runPipeline(
          extended,
          env.projectDir,
          { walkRoot: env.projectDir },
          resolverConfig,
          ignoreReader,
        );

        expect(extResult.included.map((e) => e.path).sort(), `position ${position}: included set unchanged`).toEqual(
          baseResult.included.map((e) => e.path).sort(),
        );
        expect(extResult.excluded.map((e) => e.path).sort(), `position ${position}: excluded set unchanged`).toEqual(
          baseResult.excluded.map((e) => e.path).sort(),
        );
        for (const extEntry of extResult.excluded) {
          const baseEntry = baseExcluded.get(extEntry.path);
          expect(extEntry.decisionTrail, `position ${position}: trail for "${extEntry.path}" must be unchanged`)
            .toEqual(
              baseEntry!.decisionTrail,
            );
        }
        const artifactInIncluded = extResult.included.find((e) => e.path === artifactFilePath);
        expect(artifactInIncluded, `position ${position}: ${artifactFilePath} absent from included scope`)
          .toBeUndefined();
      }
    });
  });

  it("layer-sequence extensibility: a matching custom layer inserted at position p adds exactly one trail entry at that position for matched paths", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);

      const customLayerName = "custom-test";
      const customLayer: LayerEntry = {
        predicate: (path: string): LayerDecision => ({
          matched: path === cleanFilePath,
          layer: customLayerName,
        }),
        extractConfig: () => ({}),
      };

      const baseResult = await resolveScope(env.projectDir, { walkRoot: env.projectDir }, resolverConfig);
      const baseExcluded = new Map(baseResult.excluded.map((e) => [e.path, e]));
      const ignoreReader = createIgnoreSourceReader(env.projectDir, {
        ignoreSourceFilename: resolverConfig.ignoreSourceFilename,
        specTreeRootSegment: resolverConfig.specTreeRootSegment,
      });

      for (let position = 0; position <= LAYER_SEQUENCE.length; position++) {
        const extended = [
          ...LAYER_SEQUENCE.slice(0, position),
          customLayer,
          ...LAYER_SEQUENCE.slice(position),
        ];
        const extResult = await runPipeline(
          extended,
          env.projectDir,
          { walkRoot: env.projectDir },
          resolverConfig,
          ignoreReader,
        );

        const customExcluded = extResult.excluded.find((e) => e.path === cleanFilePath);
        expect(customExcluded, `position ${position}: ${cleanFilePath} should be excluded by custom layer`)
          .toBeDefined();

        const customTrailEntry = customExcluded!.decisionTrail.find((d) => d.layer === customLayerName);
        expect(customTrailEntry, `position ${position}: trail must name "${customLayerName}"`).toBeDefined();

        // Artifact files are pruned during walk (collectPaths skips artifact directories); verify they are absent from included
        const artifactInIncluded = extResult.included.find((e) => e.path === artifactFilePath);
        expect(artifactInIncluded, `position ${position}: ${artifactFilePath} absent from included scope`)
          .toBeUndefined();

        const hiddenExcluded = extResult.excluded.find((e) => e.path === hiddenFilePath);
        expect(hiddenExcluded, `position ${position}: ${hiddenFilePath} still excluded`).toBeDefined();

        const ignoredExcluded = extResult.excluded.find((e) => e.path === ignoredFilePath);
        expect(ignoredExcluded, `position ${position}: ${ignoredFilePath} still excluded`).toBeDefined();

        for (const extEntry of extResult.excluded) {
          const baseEntry = baseExcluded.get(extEntry.path);
          if (baseEntry) {
            expect(extEntry.decisionTrail, `position ${position}: trail for "${extEntry.path}" must be unchanged`)
              .toEqual(
                baseEntry.decisionTrail,
              );
          }
        }
      }
    });
  });
});
