import { describe, expect, it } from "vitest";

import { specContextDivergentCitationDecisions } from "@testing/generators/spec-tree/context-target";
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
        // String relational comparison orders by UTF-16 code units: the
        // canonical ordinal order, computed without the production comparator.
        [paths.citedDecisionPath, paths.transitiveCitedDecisionPath, paths.peerDecisionPath].sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0
        ),
      );
    });
  });

  it("appends cited decisions in canonical path order even when the citation order reverses it", async () => {
    await withRichContextEnv(async (env, paths) => {
      const divergent = specContextDivergentCitationDecisions(env.fixture);
      for (const decision of [divergent.citedFirst, divergent.citedSecond]) {
        await env.writeRaw(decision.path, decision.content);
      }
      // The target cites the canonically later decision first, so discovery
      // order and canonical path order disagree.
      await env.writeRaw(
        paths.targetSpecPath,
        `${
          paths.sourceText[paths.targetSpecPath]
        }\nUnder [later](${divergent.citedFirst.path}) then [earlier](${divergent.citedSecond.path}).\n`,
      );
      const shown = documentPaths(await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir }));
      expect(shown.indexOf(divergent.citedSecond.path)).toBeLessThan(shown.indexOf(divergent.citedFirst.path));
    });
  });

  it("selects a decision linked from an explicitly targeted node's Full outcome record, outside the walk, in Full", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The decision sits under the peer directory, which no Full container of
      // the walk reaches, and no other document cites it: only the target's
      // outcome record can bring it into the projection.
      const { citedFirst: linked } = specContextDivergentCitationDecisions(env.fixture);
      await env.writeRaw(linked.path, linked.content);
      const unlinked = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentAt(unlinked, linked.path)).toBeUndefined();

      await env.writeRaw(
        paths.targetOutcomePath,
        `${paths.sourceText[paths.targetOutcomePath]}\nMoves under [linked](${linked.path}).\n`,
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(documentAt(entries, paths.targetOutcomePath)?.content).toContain(linked.path);
      expect(documentAt(entries, linked.path)?.content).toBe(linked.content);
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
