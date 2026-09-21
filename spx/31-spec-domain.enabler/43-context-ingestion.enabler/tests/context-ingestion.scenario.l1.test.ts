import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_ENTRIES_KEY } from "@/commands/spec/context-show";
import { compareSpecContextOrdinal, SPEC_CONTEXT_FRAME, SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION } from "@/lib/spec-tree";
import {
  contextListJson,
  contextShowEntries,
  contextShowJson,
  contextShowText,
  documentAt,
  documentPaths,
  entryPaths,
  parseContextEntries,
  parseContextManifest,
  referencePaths,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context list and show", () => {
  it("emits the versioned structural manifest from list and framed entries without manifest fields from show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = parseContextManifest(await contextListJson({ targets: [paths.targetId], cwd: env.productDir }));
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(manifest.read.length).toBeGreaterThan(0);
      expect(manifest.listed.length).toBeGreaterThan(0);

      const shownJson = await contextShowJson({ targets: [paths.targetId], cwd: env.productDir });
      const shown = JSON.parse(shownJson) as Record<string, unknown>;
      expect(Object.keys(shown)).toEqual([SPEC_CONTEXT_ENTRIES_KEY]);
      for (const field of Object.keys(manifest)) {
        expect(shown).not.toHaveProperty(field);
      }
      const text = await contextShowText({ targets: [paths.targetId], cwd: env.productDir });
      expect(text.startsWith(`<${SPEC_CONTEXT_FRAME.DOCUMENT}`)).toBe(true);
      expect(parseContextEntries(shownJson)[0]?.path).toBe(paths.productPath);
    });
  });

  it("supplies the complete product spec and a depth-bounded Product Tree map when show has no target", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      // The product spec is the one structurally Full document; every node at
      // depths one and two and every decision at depths zero through two is a
      // Digest, except the peer decision the target's Digest opening cites.
      expect(documentAt(entries, paths.productPath)?.content).toBe(paths.sourceText[paths.productPath]);
      expect(documentAt(entries, paths.peerDecisionPath)?.content).toBe(paths.sourceText[paths.peerDecisionPath]);
      for (
        const digest of [
          paths.rootSpecPath,
          paths.targetSpecPath,
          paths.lowerSiblingSpecPath,
          paths.sameIndexSiblingSpecPath,
          paths.higherIndexSiblingSpecPath,
          paths.higherProductDecisionPath,
          paths.ancestorDecisionPath,
          paths.higherAncestorDecisionPath,
          paths.citedDecisionPath,
          paths.transitiveCitedDecisionPath,
        ]
      ) {
        expect(documentAt(entries, digest)?.content, digest).toBe(paths.openingText[digest]);
      }
      expect(referencePaths(entries)).toEqual([paths.rootIssuesPath, paths.targetIssuesPath]);
      expect(documentPaths(entries)).not.toContain(paths.targetOutcomePath);
      expect(entryPaths(entries)).not.toContain(paths.targetKnowledgeIndexPath);
      // The bound stops below the target: a node one level deeper is absent
      // here while a targeted projection of its parent still carries it.
      expect(entryPaths(entries)).not.toContain(paths.deepDescendantSpecPath);
      expect(entryPaths(await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir })))
        .toContain(paths.deepDescendantSpecPath);
    });
  });

  it("supplies Full target and ancestor context, Digest sibling and child awareness, decisions, and path references for a targeted show", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      for (
        const full of [
          paths.productPath,
          paths.rootSpecPath,
          paths.ancestorDecisionPath,
          paths.higherAncestorDecisionPath,
          paths.higherProductDecisionPath,
        ]
      ) {
        expect(documentAt(entries, full)?.content, full).toBe(paths.sourceText[full]);
      }
      expect(documentAt(entries, paths.targetOutcomePath)?.content).toBe(paths.bodyText[paths.targetOutcomePath]);
      const target = documentAt(entries, paths.targetSpecPath);
      expect(target?.metadata).toEqual(paths.targetSelectedMetadata);
      expect(target?.content).toBe(paths.bodyText[paths.targetSpecPath]);
      for (
        const digest of [paths.lowerSiblingSpecPath, paths.sameIndexSiblingSpecPath, paths.higherIndexSiblingSpecPath]
      ) {
        expect(documentAt(entries, digest)?.content, digest).toBe(paths.openingText[digest]);
      }
      expect(referencePaths(entries)).toEqual([
        paths.rootIssuesPath,
        paths.targetIssuesPath,
        paths.targetKnowledgeIndexPath,
      ]);
      // Cited decisions the walk did not select append after the structural entries in path order.
      expect(documentPaths(entries).slice(-3)).toEqual(
        [paths.citedDecisionPath, paths.transitiveCitedDecisionPath, paths.peerDecisionPath].sort(
          compareSpecContextOrdinal,
        ),
      );
      const rootEntries = await contextShowEntries({ targets: [paths.rootDirectory], cwd: env.productDir });
      expect(documentAt(rootEntries, paths.targetSpecPath)?.content).toBe(paths.openingText[paths.targetSpecPath]);
    });
  });
});
