import { describe, expect, it } from "vitest";

import { specContextDivergentCitationDecisions } from "@testing/generators/spec-tree/context-target";
import { inlineCitation } from "@testing/generators/spec-tree/rich-context";
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

  it("scans the complete source of a Full document and of a Digest document, so a citation below the Digest's displayed paragraph selects its decision", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Both decisions sit under the peer directory, outside every Full
      // container of the targeted walk, and each has exactly one citer: the
      // Full target spec cites one, and the lower sibling — a Digest in the
      // targeted projection — cites the other below its opening paragraph.
      const { citedFirst: fromFull, citedSecond: fromDigest } = specContextDivergentCitationDecisions(env.fixture);
      for (const decision of [fromFull, fromDigest]) await env.writeRaw(decision.path, decision.content);
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nAlso under ${inlineCitation(fromFull.path)}.\n`,
      );
      await env.writeRaw(
        paths.lowerSiblingSpecPath,
        `${paths.sourceText[paths.lowerSiblingSpecPath]}\nBelow the opening: ${inlineCitation(fromDigest.path)}.\n`,
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const siblingShown = documentAt(entries, paths.lowerSiblingSpecPath)?.content;
      expect(siblingShown).toBe(paths.openingText[paths.lowerSiblingSpecPath]);
      expect(siblingShown).not.toContain(fromDigest.path);
      expect(documentAt(entries, fromFull.path)?.content).toBe(fromFull.content);
      expect(documentAt(entries, fromDigest.path)?.content).toBe(fromDigest.content);
    });
  });
});
