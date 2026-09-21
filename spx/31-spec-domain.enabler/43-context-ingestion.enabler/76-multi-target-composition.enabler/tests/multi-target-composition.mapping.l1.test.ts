import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_MODE, suppressLoadedSpecContext } from "@/lib/spec-tree";
import { SPEC_CONTEXT_MODE_CARRIES, specContextProjectedEntry } from "@testing/generators/spec-tree/context-target";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { contextShowEntries, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context suppression precedence", () => {
  it("maps every loaded and requested mode pair to suppression exactly when the loaded mode carries the requested content", () => {
    const modes = Object.values(SPEC_CONTEXT_MODE);
    const path = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    for (const loaded of modes) {
      for (const requested of modes) {
        const remaining = suppressLoadedSpecContext(
          [specContextProjectedEntry(path, requested)],
          [specContextProjectedEntry(path, loaded)],
        );
        const suppressed = SPEC_CONTEXT_MODE_CARRIES[loaded].includes(requested);
        expect(remaining.length, `loaded ${loaded}, requested ${requested}`).toBe(suppressed ? 0 : 1);
      }
    }
  });

  it("maps an entry no loaded projection covers to itself and merges several loaded projections by their highest mode", () => {
    const covered = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
    const uncovered = `${covered}-other`;
    const remaining = suppressLoadedSpecContext(
      [
        specContextProjectedEntry(covered, SPEC_CONTEXT_MODE.FULL),
        specContextProjectedEntry(uncovered, SPEC_CONTEXT_MODE.DIGEST),
      ],
      [
        specContextProjectedEntry(covered, SPEC_CONTEXT_MODE.DIGEST),
        specContextProjectedEntry(covered, SPEC_CONTEXT_MODE.FULL),
      ],
    );
    expect(remaining.map((entry) => entry.path)).toEqual([uncovered]);
  });

  it("applies suppression to a targeted call and to a targetless call alike", async () => {
    await withRichContextEnv(async (env, paths) => {
      // A targeted call whose own target is declared loaded keeps nothing;
      // a targetless call whose product projection is declared loaded keeps
      // nothing either — both paths pass through the same suppression.
      const targeted = await contextShowEntries({
        targets: [paths.targetId],
        cwd: env.productDir,
        loadedTargets: [paths.targetId],
      });
      expect(targeted).toEqual([]);
      const targetless = await contextShowEntries({ targets: [], cwd: env.productDir, loadedProduct: true });
      expect(targetless).toEqual([]);
      // Without a declaration both calls emit their projections, so the
      // empty results above come from suppression and not from an empty tree.
      expect((await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir })).length).toBeGreaterThan(0);
      expect((await contextShowEntries({ targets: [], cwd: env.productDir })).length).toBeGreaterThan(0);
    });
  });
});
