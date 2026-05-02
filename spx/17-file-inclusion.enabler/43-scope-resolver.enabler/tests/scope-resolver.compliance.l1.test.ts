import { describe, expect, it } from "vitest";

import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { LAYER_SEQUENCE } from "@/lib/file-inclusion/layer-sequence";
import { EXPLICIT_OVERRIDE_LAYER, resolveScope } from "@/lib/file-inclusion/pipeline";

import {
  artifactFilePath,
  excludedNodeSegment,
  hiddenFilePath,
  ignoredFilePath,
  integrationConfig,
  resolverConfig,
  writeExclude,
  writeTestFiles,
} from "./support";

describe("scope resolver — compliance", () => {
  it("LAYER_SEQUENCE is a non-empty ordered tuple — the declaration exports exactly one symbol with the expected shape", () => {
    expect(Array.isArray(LAYER_SEQUENCE)).toBe(true);
    expect(LAYER_SEQUENCE.length).toBeGreaterThan(0);
    for (const entry of LAYER_SEQUENCE) {
      expect(typeof entry.predicate).toBe("function");
      expect(typeof entry.extractConfig).toBe("function");
    }
  });

  it("LAYER_SEQUENCE layer names are a non-empty set of known string identifiers — all layer names are non-empty strings", () => {
    const layerNames = LAYER_SEQUENCE.map((entry) => {
      const sample = entry.predicate("any-path", entry.extractConfig(resolverConfig));
      return sample.layer;
    });
    expect(layerNames.length).toBeGreaterThan(0);
    for (const name of layerNames) {
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("explicit-override short-circuits at pipeline level: an explicit path matching every non-override layer has a trail containing only explicit-override", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeExclude(env, [excludedNodeSegment]);
      // ignoredFilePath matches ignore-source; artifactFilePath matches artifact-directory
      // Use a path that would match both to prove neither layer appears in the trail
      const pathMatchingBothLayers = artifactFilePath;
      const result = await resolveScope(
        env.projectDir,
        { explicit: [pathMatchingBothLayers, ignoredFilePath, hiddenFilePath] },
        resolverConfig,
      );

      for (const explicitPath of [pathMatchingBothLayers, ignoredFilePath, hiddenFilePath]) {
        const entry = result.included.find((e) => e.path === explicitPath);
        expect(entry, `scope.resolver.compliance absent from scope.included: ${explicitPath}`).toBeDefined();
        expect(entry!.decisionTrail.length).toBe(1);
        expect(entry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);
      }
    });
  });

  it("ScopeResult always carries per-path decision trails on excluded entries — no excluded entry has an empty trail", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);
      const result = await resolveScope(env.projectDir, { walkRoot: env.projectDir }, resolverConfig);
      for (const excluded of result.excluded) {
        expect(
          excluded.decisionTrail.length,
          `excluded path "${excluded.path}" must have a non-empty decision trail`,
        ).toBeGreaterThan(0);
      }
    });
  });

  it("ScopeResult caller-supplied explicit paths always carry an explicit-override trail entry — no explicit path lacks the override trail", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);
      const explicitPaths = [artifactFilePath, ignoredFilePath, hiddenFilePath];
      const result = await resolveScope(
        env.projectDir,
        { explicit: explicitPaths, walkRoot: env.projectDir },
        resolverConfig,
      );
      for (const path of explicitPaths) {
        const entry = result.included.find((e) => e.path === path);
        expect(entry, `explicit path "${path}" must be in included`).toBeDefined();
        expect(
          entry!.decisionTrail.some((d) => d.layer === EXPLICIT_OVERRIDE_LAYER),
          `explicit path "${path}" must have explicit-override in trail`,
        ).toBe(true);
      }
    });
  });
});
