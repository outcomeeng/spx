import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_MODE, SPEC_CONTEXT_MODE_NAME, SPEC_CONTEXT_SELECTION_REASON } from "@/lib/spec-tree";
import {
  specContextAbsentDecisionPath,
  specContextDivergentCitationDecisions,
  specContextNonCitationShapes,
  specContextRelativeSegmentDecisionPath,
} from "@testing/generators/spec-tree/context-target";
import { inlineCitation, richContextReasonBindings } from "@testing/generators/spec-tree/rich-context";
import {
  contextListManifest,
  contextShowEntries,
  contextShowFailure,
  documentAt,
  documentPaths,
  entryPaths,
  manifestEntryAt,
  manifestPathsForReason,
  referencePaths,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context citation boundaries", () => {
  it("binds a Markdown inline link whose href is a decision's full path from `spx/` as a citation of that decision", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The decision sits under the peer directory, which no Full container of
      // the targeted walk reaches, so only the citation can select it.
      const { citedFirst: decision } = specContextDivergentCitationDecisions(env.fixture);
      await env.writeRaw(decision.path, decision.content);
      const options = { targets: [paths.targetId], cwd: env.productDir };
      expect(entryPaths(await contextShowEntries(options))).not.toContain(decision.path);

      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nGoverned by ${inlineCitation(decision.path)}.\n`,
      );
      expect(entryPaths(await contextShowEntries(options))).toContain(decision.path);
    });
  });

  it("binds no citation from a `../` link, a leading-slash link, another link destination, a bare path, or a code-span path", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The decision exists and nothing else cites it: any of these shapes
      // binding it would bring it into the projection.
      const { citedFirst: decision } = specContextDivergentCitationDecisions(env.fixture);
      await env.writeRaw(decision.path, decision.content);
      const parentRelativeHref = posix.relative(posix.dirname(paths.targetSpecPath), decision.path);
      expect(parentRelativeHref.startsWith("../")).toBe(true);
      // The generated shapes name a decision path no tracked file satisfies,
      // so binding any of them would fail the projection outright.
      const shapes = specContextNonCitationShapes(env.fixture);
      const forms = [
        `[relative](${parentRelativeHref})`,
        `[rooted](/${decision.path})`,
        decision.path,
        `\`${decision.path}\``,
        ...shapes.proseShapes,
      ];
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nMentions ${forms.join(", ")} without binding any.\n`,
      );
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(entryPaths(entries)).not.toContain(decision.path);
      expect(entryPaths(entries)).not.toContain(shapes.unboundDecisionPath);
    });
  });

  it("binds no citation from a coordination note, even an inline link naming a decision's full path", async () => {
    await withRichContextEnv(async (env, paths) => {
      const { citedFirst: decision } = specContextDivergentCitationDecisions(env.fixture);
      await env.writeRaw(decision.path, decision.content);
      // Each note carries a citation-shaped inline link to the existing,
      // otherwise uncited decision and to a decision no tracked file
      // satisfies: a scan of any note body would select the one or fail on
      // the other.
      const absent = specContextAbsentDecisionPath(env.fixture, paths.targetId);
      const links = [inlineCitation(decision.path), inlineCitation(absent)].join("\n");
      await env.writeRaw(paths.targetIssuesPath, `${paths.targetIssuesText}\n${links}`);
      await env.writeRaw(paths.ancestorIssuesPath, `# Ancestor issues\n\n${links}`);
      await env.writeRaw(paths.rootPlanPath, `# Plan\n\n${links}`);
      await env.writeRaw(paths.ancestorPlanPath, `# Ancestor plan\n\n${links}`);
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      expect(referencePaths(entries)).toContain(paths.targetIssuesPath);
      expect(referencePaths(entries)).toContain(paths.ancestorIssuesPath);
      expect(entryPaths(entries)).not.toContain(decision.path);
      expect(entryPaths(entries)).not.toContain(absent);
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

  it("projects every decision reached only by citation in Full, in show's content and list's mode alike", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The peer, cited, and transitive decisions sit under the peer
      // directory, outside every structural walk of the nested target: the
      // target's opening, the target's body, and the cited decision reach them.
      const options = { targets: [paths.targetId], cwd: env.productDir };
      const manifest = await contextListManifest(options);
      const entries = await contextShowEntries(options);
      const citedOnly = [paths.peerDecisionPath, paths.citedDecisionPath, paths.transitiveCitedDecisionPath];
      for (const path of citedOnly) {
        expect(documentAt(entries, path)?.content, path).toBe(paths.sourceText[path]);
        expect(manifestEntryAt(manifest, path)?.mode, path).toBe(SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL]);
      }
      expect(manifestPathsForReason(manifest, SPEC_CONTEXT_SELECTION_REASON.CITED_DECISION)).toEqual(
        expect.arrayContaining(citedOnly),
      );
    });
  });

  it("records on the list entry of a decision reached only by citation every selected document that cites it, in show's order", async () => {
    await withRichContextEnv(async (env, paths) => {
      const witness = richContextReasonBindings(paths)[SPEC_CONTEXT_SELECTION_REASON.CITED_DECISION];
      const options = { targets: [witness.targetId], cwd: env.productDir };
      const manifest = await contextListManifest(options);
      const entries = await contextShowEntries(options);
      // The citers are the shown documents whose source carries the inline
      // link the scenario wrote to the witness, taken in show's own order.
      const citation = inlineCitation(witness.path);
      const citers = documentPaths(entries).filter((path) => paths.sourceText[path]?.includes(citation) === true);
      // The Full target spec and the Digest lower sibling, which cites the
      // witness below its displayed opening, are both among them.
      expect(citers).toEqual(expect.arrayContaining([paths.targetSpecPath, paths.lowerSiblingSpecPath]));
      expect(manifestEntryAt(manifest, witness.path)?.citedBy).toEqual(citers);
    });
  });

  it("records on the list entry of a decision one target selects structurally and another target reaches by citation every selected document that cites it, in show's order", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The peer node directly contains the cited decision, so targeting it
      // selects the decision structurally; the nested target reaches the same
      // decision only through the citations its walk carries.
      const options = { targets: [paths.targetId, paths.higherIndexSiblingPath], cwd: env.productDir };
      const manifest = await contextListManifest(options);
      const entries = await contextShowEntries(options);
      const citation = inlineCitation(paths.citedDecisionPath);
      const citers = documentPaths(entries).filter((path) => paths.sourceText[path]?.includes(citation) === true);
      const entry = manifestEntryAt(manifest, paths.citedDecisionPath);
      expect(entry?.selections.map(({ reason }) => reason)).toEqual(
        expect.arrayContaining([SPEC_CONTEXT_SELECTION_REASON.TARGET, SPEC_CONTEXT_SELECTION_REASON.CITED_DECISION]),
      );
      expect(citers).toEqual(expect.arrayContaining([paths.targetSpecPath, paths.lowerSiblingSpecPath]));
      expect(entry?.citedBy).toEqual(citers);
    });
  });

  it("records no citing documents on a list entry whose every selection holds a reason that precedes the cited-decision reason, even when a selected document cites it", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The ancestor decision is selected structurally on the target's path
      // and cited from the target spec as well, so its one selection keeps
      // the structural reason.
      await env.writeRaw(
        paths.targetSpecPath,
        `${paths.sourceText[paths.targetSpecPath]}\nAlso under ${inlineCitation(paths.ancestorDecisionPath)}.\n`,
      );
      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      const entry = manifestEntryAt(manifest, paths.ancestorDecisionPath);
      expect(entry?.selections.map(({ reason }) => reason)).toEqual([SPEC_CONTEXT_SELECTION_REASON.ANCESTOR]);
      expect(entry).not.toHaveProperty("citedBy");
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

  it("fails the whole projection naming the citation and its citing document when an unresolved citation sits below a Digest's displayed opening", async () => {
    await withRichContextEnv(async (env, paths) => {
      // The same-index sibling is a Digest in the targeted projection; its
      // complete source is scanned, so the link below its opening binds.
      const missing = specContextAbsentDecisionPath(env.fixture, paths.targetId);
      await env.writeRaw(
        paths.sameIndexSiblingSpecPath,
        `${paths.sourceText[paths.sameIndexSiblingSpecPath]}\nBelow the opening: [absent](${missing}).\n`,
      );
      const failure = await contextShowFailure({ targets: [paths.targetId], cwd: env.productDir });
      expect(failure).toContain(missing);
      expect(failure).toContain(paths.sameIndexSiblingSpecPath);
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
