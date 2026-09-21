import { describe, expect, it } from "vitest";

import { DECISION_KINDS, KIND_REGISTRY } from "@/lib/spec-tree";
import { specContextNonCitationShapes } from "@testing/generators/spec-tree/context-target";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  contextShowEntries,
  contextShowFailure,
  documentPaths,
  entryPaths,
  rootedSpecPath,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context citation boundaries", () => {
  it("binds no citation from bare path text, other link destinations, off-grammar hrefs, coordination notes, or undisplayed content", async () => {
    await withRichContextEnv(async (env, paths) => {
      const shapes = specContextNonCitationShapes();
      // Every shape sits in the Full target spec; the product-root PLAN note
      // already names a decision path that exists nowhere; the same-index
      // sibling, a Digest, cites an absent decision below its opening.
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nMentions ${shapes.proseShapes.join(", ")} without binding any.\n`,
      );
      const undisplayed = rootedSpecPath(
        `${paths.higherIndexSiblingPath.slice(rootedSpecPath("").length)}/98-${
          sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())
        }${KIND_REGISTRY[DECISION_KINDS[0]].suffix}`,
      );
      await env.writeRaw(
        paths.sameIndexSiblingSpecPath,
        `${paths.sourceText[paths.sameIndexSiblingSpecPath]}\nBelow the opening: [absent](${undisplayed}).\n`,
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(entryPaths(entries)).not.toContain(shapes.unboundDecisionPath);
      expect(entryPaths(entries)).not.toContain(undisplayed);
      expect(entryPaths(entries).some((path) => path.includes(".."))).toBe(false);
    });
  });

  it("selects a decision once however many documents cite it and whether or not the citation chain cycles", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The target, the lower sibling, and the cited decision itself all cite
      // the cited decision; the ancestor decision is selected structurally and
      // cited from the target as well.
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nAlso under [ancestor](${paths.ancestorDecisionPath}).\n`,
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const occurrences = (path: string): number => documentPaths(entries).filter((entry) => entry === path).length;
      expect(occurrences(paths.citedDecisionPath)).toBe(1);
      expect(occurrences(paths.ancestorDecisionPath)).toBe(1);
      expect(occurrences(paths.transitiveCitedDecisionPath)).toBe(1);
      expect(new Set(entryPaths(entries)).size).toBe(entryPaths(entries).length);
    });
  });

  it("fails the whole projection naming the cited path and the citing document when a citation resolves to no tracked decision", async () => {
    await withRichContextEnv(async (env, paths) => {
      const missing = rootedSpecPath(
        `${paths.targetId}/97-${sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug())}${
          KIND_REGISTRY[DECISION_KINDS[0]].suffix
        }`,
      );
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nGoverned by [absent](${missing}).\n`,
      );
      const failure = await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir });
      expect(failure).toContain(missing);
      expect(failure).toContain(paths.targetSpecPath);
    });
  });
});
