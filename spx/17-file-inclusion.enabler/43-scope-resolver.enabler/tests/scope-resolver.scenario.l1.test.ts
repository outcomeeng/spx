import { describe, expect, it } from "vitest";

import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import { EXPLICIT_OVERRIDE_LAYER, resolveScope } from "@/lib/file-inclusion/pipeline";
import { HIDDEN_PREFIX_LAYER } from "@/lib/file-inclusion/predicates/hidden-prefix";
import { IGNORE_SOURCE_LAYER } from "@/lib/file-inclusion/predicates/ignore-source";

import {
  artifactFilePath,
  cleanFilePath,
  excludedNodeSegment,
  hiddenFilePath,
  ignoredFilePath,
  integrationConfig,
  resolverConfig,
  writeExclude,
  writeTestFiles,
} from "./support";

describe("scope resolver — scenarios", () => {
  it("an explicit path that also matches every non-override layer appears in included with explicit-override as the first trail entry", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeExclude(env, [excludedNodeSegment]);
      const explicitPath = artifactFilePath;
      const result = await resolveScope(env.projectDir, { explicit: [explicitPath] }, resolverConfig);
      const entry = result.included.find((e) => e.path === explicitPath);
      expect(entry, `expected ${explicitPath} in included`).toBeDefined();
      expect(entry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);
    });
  });

  it("a walk root containing paths matching each non-override layer produces excluded entries naming the responsible layer", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);
      const result = await resolveScope(env.projectDir, { walkRoot: env.projectDir }, resolverConfig);

      // collectPaths skips artifact directories during the walk; artifact files never enter included
      const artifactInIncluded = result.included.find((e) => e.path === artifactFilePath);
      expect(artifactInIncluded, `${artifactFilePath} must not appear in included`).toBeUndefined();

      const hidden = result.excluded.find((e) => e.path === hiddenFilePath);
      expect(hidden, `expected ${hiddenFilePath} in excluded`).toBeDefined();
      expect(hidden!.decisionTrail.some((d) => d.layer === HIDDEN_PREFIX_LAYER)).toBe(true);

      const ignored = result.excluded.find((e) => e.path === ignoredFilePath);
      expect(ignored, `expected ${ignoredFilePath} in excluded`).toBeDefined();
      expect(ignored!.decisionTrail.some((d) => d.layer === IGNORE_SOURCE_LAYER)).toBe(true);

      const clean = result.included.find((e) => e.path === cleanFilePath);
      expect(clean, `expected ${cleanFilePath} in included`).toBeDefined();
    });
  });

  it("a request with both explicit paths and a walk root places explicit paths in included and resolves walked paths independently", async () => {
    await withTestEnv(integrationConfig, async (env) => {
      await writeTestFiles(env);
      await writeExclude(env, [excludedNodeSegment]);
      const result = await resolveScope(
        env.projectDir,
        { explicit: [artifactFilePath], walkRoot: env.projectDir },
        resolverConfig,
      );

      const explicitEntry = result.included.find((e) => e.path === artifactFilePath);
      expect(explicitEntry, `expected explicit ${artifactFilePath} in included`).toBeDefined();
      expect(explicitEntry!.decisionTrail[0]?.layer).toBe(EXPLICIT_OVERRIDE_LAYER);

      const walkedIgnored = result.excluded.find((e) => e.path === ignoredFilePath);
      expect(walkedIgnored, `expected walked ${ignoredFilePath} in excluded`).toBeDefined();

      const clean = result.included.find((e) => e.path === cleanFilePath);
      expect(clean, `expected ${cleanFilePath} in included`).toBeDefined();
    });
  });
});
