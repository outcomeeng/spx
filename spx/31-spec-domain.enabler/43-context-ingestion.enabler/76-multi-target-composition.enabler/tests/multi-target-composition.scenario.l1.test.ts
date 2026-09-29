import { describe, expect, it } from "vitest";

import { contextShowEntries, documentAt, entryPaths, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context multi-target composition", () => {
  it("merges the projections of several targets by identity with Full over Digest, each shared entry once, after computing each projection's citation closure", async () => {
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
      // The closure of each projection is computed before the merge: the
      // target's spec cites one decision, which cites a second, and both
      // reach the merged stream.
      expect(documentAt(merged, paths.citedDecisionPath)?.content)
        .toBe(paths.sourceText[paths.citedDecisionPath]);
      expect(documentAt(merged, paths.transitiveCitedDecisionPath)?.content)
        .toBe(paths.sourceText[paths.transitiveCitedDecisionPath]);
    });
  });
});
