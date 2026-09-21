import { describe, expect, it } from "vitest";

import { compareSpecContextOrdinal } from "@/lib/spec-tree";
import { contextShowEntries, documentAt, documentPaths, withRichContextEnv } from "@testing/harnesses/spec/context";

describe("spec context cited decisions", () => {
  it("selects every decision cited from Full content transitively, in Full, appended after the walk in path order", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The target spec cites the cited decision, which cites the transitive
      // decision; its opening cites the peer decision. None of the three is
      // under a Full container of the walk, so all three append after it.
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      for (const cited of [paths.citedDecisionPath, paths.transitiveCitedDecisionPath, paths.peerDecisionPath]) {
        expect(documentAt(entries, cited)?.content, cited).toBe(paths.sourceText[cited]);
      }
      const structuralCount = documentPaths(entries).length - 3;
      expect(documentPaths(entries).slice(structuralCount)).toEqual(
        [paths.citedDecisionPath, paths.transitiveCitedDecisionPath, paths.peerDecisionPath].sort(
          compareSpecContextOrdinal,
        ),
      );
    });
  });

  it("selects a decision cited from a Digest opening paragraph in Full", async () => {
    await withRichContextEnv(async (env, paths) => {
      // In discovery the target is a Digest whose opening cites the peer
      // decision; the peer decision therefore upgrades from Digest to Full
      // while the decision the target's body cites stays a Digest.
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      expect(documentAt(entries, paths.peerDecisionPath)?.content).toBe(paths.sourceText[paths.peerDecisionPath]);
      expect(documentAt(entries, paths.citedDecisionPath)?.content).toBe(paths.openingText[paths.citedDecisionPath]);
    });
  });
});
