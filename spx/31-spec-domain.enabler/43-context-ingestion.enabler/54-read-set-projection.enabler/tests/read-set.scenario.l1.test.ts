import { describe, expect, it } from "vitest";

import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  contextShowEntries,
  documentAt,
  documentPaths,
  entryPaths,
  referencePaths,
  withRichContextEnv,
} from "@testing/harnesses/spec/context";

describe("spec context read-set selection", () => {
  it("renders the targetless discovery set: product in Full, nodes at depths one and two and decisions at depths zero through two in Digest, issue notes as references", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [], cwd: env.productDir });
      expect(documentAt(entries, paths.productPath)?.content).toBe(paths.sourceText[paths.productPath]);
      for (
        const digest of [
          paths.rootSpecPath,
          paths.lowerSiblingSpecPath,
          paths.sameIndexSiblingSpecPath,
          paths.higherIndexSiblingSpecPath,
          paths.targetSpecPath,
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
      expect(entryPaths(entries)).not.toContain(paths.targetOutcomePath);
      expect(entryPaths(entries)).not.toContain(paths.rootKnowledgeIndexPath);
    });
  });

  it("renders a targeted projection: target and ancestors in Full, path siblings and immediate children in Digest, contained decisions in Full", async () => {
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
      expect(documentAt(entries, paths.targetSpecPath)?.content).toBe(paths.bodyText[paths.targetSpecPath]);
      for (
        const digest of [paths.lowerSiblingSpecPath, paths.sameIndexSiblingSpecPath, paths.higherIndexSiblingSpecPath]
      ) {
        expect(documentAt(entries, digest)?.content, digest).toBe(paths.openingText[digest]);
      }
      // Targeting the root node makes its child an immediate child in Digest
      // and the higher-index sibling's decision unselected.
      const rootEntries = await contextShowEntries({ targets: [paths.rootDirectory], cwd: env.productDir });
      expect(documentAt(rootEntries, paths.rootSpecPath)?.content).toBe(paths.sourceText[paths.rootSpecPath]);
      expect(documentAt(rootEntries, paths.targetSpecPath)?.content).toBe(paths.openingText[paths.targetSpecPath]);
      expect(documentPaths(rootEntries)).not.toContain(paths.targetOutcomePath);
    });
  });

  it("renders an explicit product-root target as the product and its decisions in Full, its immediate children in Digest, and its knowledge index reference, unlike targetless discovery", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [SPEC_TREE_CONFIG.ROOT_DIRECTORY], cwd: env.productDir });
      expect(documentAt(entries, paths.productPath)?.content).toBe(paths.sourceText[paths.productPath]);
      expect(documentAt(entries, paths.higherProductDecisionPath)?.content).toBe(
        paths.sourceText[paths.higherProductDecisionPath],
      );
      for (const digest of [paths.rootSpecPath, paths.lowerSiblingSpecPath, paths.higherIndexSiblingSpecPath]) {
        expect(documentAt(entries, digest)?.content, digest).toBe(paths.openingText[digest]);
      }
      expect(referencePaths(entries)).toContain(paths.rootKnowledgeIndexPath);
      // Depth two and the node-owned decisions are outside an explicit root
      // target; targetless discovery includes them.
      expect(entryPaths(entries)).not.toContain(paths.targetSpecPath);
      expect(entryPaths(entries)).not.toContain(paths.ancestorDecisionPath);
      const discovery = await contextShowEntries({ targets: [], cwd: env.productDir });
      expect(entryPaths(discovery)).toContain(paths.targetSpecPath);
      expect(entryPaths(discovery)).not.toContain(paths.rootKnowledgeIndexPath);
    });
  });
});
