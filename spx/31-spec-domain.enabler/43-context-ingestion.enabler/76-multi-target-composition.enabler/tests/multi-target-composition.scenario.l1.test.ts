import { describe, expect, it } from "vitest";

import {
  contextShowEntries,
  contextShowJson,
  contextShowText,
  documentAt,
  entryPaths,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context multi-target composition", () => {
  it("merges the projections of several targets by identity with Full over Digest, each shared entry once, before suppressing loaded entries", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The root node and its nested child share the product spec, the root
      // spec (Full for one, Full as ancestor for the other), and the ancestor
      // decision; the child is a Digest for the root and Full for itself.
      const merged = await contextShowEntries({
        targets: [paths.rootDirectory, paths.targetId],
        cwd: env.productDir,
      });
      expect(new Set(entryPaths(merged)).size).toBe(entryPaths(merged).length);
      expect(documentAt(merged, paths.targetSpecPath)?.content).toBe(paths.bodyText[paths.targetSpecPath]);
      expect(documentAt(merged, paths.rootSpecPath)?.content).toBe(paths.sourceText[paths.rootSpecPath]);
      expect(documentAt(merged, paths.targetOutcomePath)?.content).toBe(paths.bodyText[paths.targetOutcomePath]);
      // Suppression happens after the merge: declaring the root loaded removes
      // what the root projection covers at a sufficient mode and keeps the
      // child's Full upgrade of its own spec.
      const remaining = await contextShowEntries({
        targets: [paths.rootDirectory, paths.targetId],
        cwd: env.productDir,
        loadedTargets: [paths.rootDirectory],
      });
      expect(entryPaths(remaining)).not.toContain(paths.rootSpecPath);
      expect(entryPaths(remaining)).not.toContain(paths.productPath);
      expect(documentAt(remaining, paths.targetSpecPath)?.content).toBe(paths.bodyText[paths.targetSpecPath]);
      expect(entryPaths(remaining)).toContain(paths.targetOutcomePath);
    });
  });

  it("reconstructs the targetless projection for --loaded-product and each target's projection for --loaded-target at every entry's selected mode", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Product loaded: the targeted show still upgrades every Digest the
      // discovery covered to Full, and drops only what discovery already
      // rendered in Full — the product spec.
      const afterProduct = await contextShowEntries({
        targets: [paths.targetId],
        cwd: env.productDir,
        loadedProduct: true,
      });
      expect(entryPaths(afterProduct)).not.toContain(paths.productPath);
      expect(documentAt(afterProduct, paths.rootSpecPath)?.content).toBe(paths.sourceText[paths.rootSpecPath]);
      expect(entryPaths(afterProduct)).not.toContain(paths.lowerSiblingSpecPath);
      // Target loaded: a repeat of the same target renders nothing.
      expect(
        await contextShowEntries({
          targets: [paths.targetId],
          cwd: env.productDir,
          loadedTargets: [paths.targetId],
        }),
      ).toEqual([]);
      // Target loaded, product requested: discovery renders only what the
      // target's projection did not cover — its Digest siblings elsewhere.
      const discoveryAfterTarget = await contextShowEntries({
        targets: [],
        cwd: env.productDir,
        loadedTargets: [paths.targetId],
      });
      expect(entryPaths(discoveryAfterTarget)).not.toContain(paths.productPath);
      expect(entryPaths(discoveryAfterTarget)).not.toContain(paths.targetSpecPath);
      expect(entryPaths(discoveryAfterTarget)).not.toContain(paths.rootSpecPath);
    });
  });

  it("accepts loaded declarations without targets, deduplicates repeats, and renders a fully suppressed projection as empty text or an empty entry list", async () => {
    await withRichContextEnv(async (env, paths) => {
      const options = {
        targets: [paths.targetId],
        cwd: env.productDir,
        loadedTargets: [paths.targetId, paths.targetId],
        loadedProduct: true,
      };
      expect(await contextShowText(options)).toHaveLength(0);
      expect(JSON.parse(await contextShowJson(options))).toEqual({ entries: [] });
      expect(await contextShowEntries({ targets: [], cwd: env.productDir, loadedProduct: true })).toEqual([]);
    });
  });
});
