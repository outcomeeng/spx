import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_TEXT_LABEL } from "@/commands/spec/context";
import { SPEC_CONTEXT_ENTRIES_KEY } from "@/commands/spec/context-show";
import { DEFAULT_METHODOLOGY_SOURCE } from "@/config/methodology";
import { SPEC_CONTEXT_FRAME, SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION, specContextBootstrap } from "@/lib/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import {
  contextListJson,
  contextListManifest,
  contextListText,
  contextShowEntries,
  contextShowJson,
  contextShowText,
  documentAt,
  documentPaths,
  entryPaths,
  METHODOLOGY_FIXTURE_VERSION,
  parseContextEntries,
  parseContextManifest,
  referencePaths,
  rootedSpecPath,
  specTreeKindsConfig,
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
      // Cited decisions the walk did not select append after the structural
      // entries in canonical path order. The cited and peer decisions share an
      // index and carry the divergent slug pair, so code-unit order places the
      // cited decision first while locale collation would reverse them.
      const appended = documentPaths(entries).slice(-3);
      expect(new Set(appended)).toEqual(
        new Set([paths.citedDecisionPath, paths.transitiveCitedDecisionPath, paths.peerDecisionPath]),
      );
      expect(appended.indexOf(paths.citedDecisionPath)).toBeLessThan(appended.indexOf(paths.peerDecisionPath));
      const rootEntries = await contextShowEntries({ targets: [paths.rootDirectory], cwd: env.productDir });
      expect(documentAt(rootEntries, paths.targetSpecPath)?.content).toBe(paths.openingText[paths.targetSpecPath]);
    });
  });

  it("carries the manifest schema version and the snapshot-derived bootstrap flag", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const manifest = await contextListManifest({ targets: [target.id], cwd: env.productDir });
      expect(manifest.schemaVersion).toBe(SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION);
      expect(specContextBootstrap(0)).toBe(true);
      expect(specContextBootstrap(snapshot.allNodes.length)).toBe(false);
      // The materialized fixture holds nodes by construction, and a
      // resolvable target implies a non-empty tree, so the emitted flag is
      // false without re-running the production derivation.
      expect(manifest.bootstrap).toBe(false);
    });
  });

  it("renders the manifest as labelled text beside its JSON representation", async () => {
    await withSpecTreeEnv(specTreeKindsConfig(), async (env) => {
      await env.materialize();
      const snapshot = await env.readFilesystemSnapshot();
      const target = snapshot.allNodes[0];
      const textOutput = await contextListText({ targets: [target.id], cwd: env.productDir });
      const jsonOutput = await contextListJson({ targets: [target.id], cwd: env.productDir });
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.TARGETS}: ${rootedSpecPath(target.id)}`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${env.productDir}`);
      expect(textOutput).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${DEFAULT_METHODOLOGY_SOURCE}@${METHODOLOGY_FIXTURE_VERSION}\n`,
      );
      expect(textOutput).toContain(
        `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION}`,
      );
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: false`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.READ}:`);
      expect(textOutput).toContain(`${SPEC_CONTEXT_TEXT_LABEL.LISTED}:`);
      expect(parseContextManifest(jsonOutput).targets).toEqual([rootedSpecPath(target.id)]);
    });
  });
});
