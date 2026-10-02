import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_READ_ROLE } from "@/lib/spec-tree";
import {
  specContextAbsentDecisionPath,
  specContextDivergentCitationDecisions,
  specContextNonCitationShapes,
  specContextRelativeSegmentDecisionPath,
} from "@testing/generators/spec-tree/context-target";
import { rootedSpecPath } from "@testing/generators/spec-tree/rich-context";
import {
  contextListManifest,
  contextShowEntries,
  contextShowFailure,
  documentAt,
  documentPaths,
  entryPaths,
  readPathsForRole,
  referencePaths,
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
      const undisplayed = specContextAbsentDecisionPath(
        env.fixture,
        paths.higherIndexSiblingPath.slice(rootedSpecPath("").length),
      );
      await env.writeRaw(
        paths.sameIndexSiblingSpecPath,
        `${paths.sourceText[paths.sameIndexSiblingSpecPath]}\nBelow the opening: [absent](${undisplayed}).\n`,
      );
      // The target's ISSUES note is selected as a reference and carries a
      // citation-shaped inline link to a decision that exists: a scan of the
      // note's body would bind it, so its absence proves notes contribute none.
      const notedDecision = specContextAbsentDecisionPath(env.fixture, paths.targetId);
      await env.writeRaw(
        paths.targetIssuesPath,
        `${paths.targetIssuesText}\nUnder [peer](${paths.peerDecisionPath}) and [absent](${notedDecision}).\n`,
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(referencePaths(entries)).toContain(paths.targetIssuesPath);
      expect(entryPaths(entries)).not.toContain(notedDecision);
      expect(entryPaths(entries)).not.toContain(shapes.unboundDecisionPath);
      expect(entryPaths(entries)).not.toContain(undisplayed);
    });
  });

  it("binds the same cited decisions in list's cited-decision role as show appends, leaving a link below a Digest sibling's opening unbound by both and binding one from the target's Full outcome record in both", async () => {
    await withRichContextEnv(async (env, paths) => {
      // Both decisions sit under the peer directory, which no Full container
      // of the targeted walk reaches, so only a citation can select either.
      const { citedFirst: outcomeLinked, citedSecond: belowOpening } = specContextDivergentCitationDecisions(
        env.fixture,
      );
      for (const decision of [outcomeLinked, belowOpening]) await env.writeRaw(decision.path, decision.content);
      // The lower-index sibling is a Digest in the targeted projection, so a
      // link below its opening paragraph is undisplayed content.
      await env.writeRaw(
        paths.lowerSiblingSpecPath,
        `${paths.sourceText[paths.lowerSiblingSpecPath]}\nBelow the opening: [below](${belowOpening.path}).\n`,
      );
      await env.writeRaw(
        paths.targetOutcomePath,
        `${paths.sourceText[paths.targetOutcomePath]}\nMoves under [linked](${outcomeLinked.path}).\n`,
      );
      const options = { targets: [paths.targetId], cwd: env.productDir };
      const manifest = await contextListManifest(options);
      const entries = await contextShowEntries(options);
      expect(documentAt(entries, paths.lowerSiblingSpecPath)?.content).toBe(
        paths.openingText[paths.lowerSiblingSpecPath],
      );
      // Show's appended cited decisions: every decision it emits that no
      // container along the target path — product root, ancestor, target —
      // directly holds, since the targeted walk selects only those.
      const snapshot = await env.readFilesystemSnapshot();
      const pathContainers = [undefined, paths.rootDirectory, paths.targetId];
      const outsideWalk = new Set(
        snapshot.decisions.filter(({ parentId }) => !pathContainers.includes(parentId)).map(({ ref }) => ref?.path),
      );
      const appended = documentPaths(entries).filter((path) => outsideWalk.has(path));
      const listed = readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.CITED_DECISION);
      expect(new Set(listed)).toEqual(new Set(appended));
      expect(appended).toContain(outcomeLinked.path);
      expect(listed).toContain(outcomeLinked.path);
      expect(appended).not.toContain(belowOpening.path);
      expect(listed).not.toContain(belowOpening.path);
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
      const missing = specContextAbsentDecisionPath(env.fixture, paths.targetId);
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nGoverned by [absent](${missing}).\n`,
      );
      const failure = await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir });
      expect(failure).toContain(missing);
      expect(failure).toContain(paths.targetSpecPath);
    });
  });

  it("binds an inline link whose href carries a parent segment between the `spx/` prefix and the decision suffix as a citation, and fails the projection naming it and its citing document", async () => {
    await withRichContextEnv(async (env, paths) => {
      const relative = specContextRelativeSegmentDecisionPath(env.fixture, paths.targetId);
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nGoverned by [relative](${relative}).\n`,
      );
      const failure = await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir });
      expect(failure).toContain(relative);
      expect(failure).toContain(paths.targetSpecPath);
    });
  });
});
