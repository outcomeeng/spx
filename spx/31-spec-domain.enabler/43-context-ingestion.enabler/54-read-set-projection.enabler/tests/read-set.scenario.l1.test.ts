import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_READ_ROLE, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  contextListManifest,
  contextShowEntries,
  documentAt,
  documentPaths,
  entryPaths,
  readPathsForRole,
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
          // The deepest declared depth: a decision the target node contains.
          paths.targetDecisionPath,
          paths.citedDecisionPath,
          paths.transitiveCitedDecisionPath,
        ]
      ) {
        expect(documentAt(entries, digest)?.content, digest).toBe(paths.openingText[digest]);
      }
      expect(referencePaths(entries)).toEqual([paths.rootIssuesPath, paths.ancestorIssuesPath, paths.targetIssuesPath]);
      expect(entryPaths(entries)).not.toContain(paths.targetOutcomePath);
      expect(entryPaths(entries)).not.toContain(paths.rootKnowledgeIndexPath);
      // The bound holds from above as well: the node one level below the
      // target stays out of discovery, so widening the depth fails here.
      expect(entryPaths(entries)).not.toContain(paths.deepDescendantSpecPath);
    });
  });

  it("renders a targeted projection: target and ancestors in Full, path siblings and immediate children in Digest, the target's decisions and the ancestors' path-governing decisions in Full", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      for (
        const full of [
          paths.productPath,
          paths.rootSpecPath,
          // Below the index of the child through which the path continues.
          paths.ancestorDecisionPath,
          // The explicit target's own contained decision, not an ancestor's.
          paths.targetDecisionPath,
        ]
      ) {
        expect(documentAt(entries, full)?.content, full).toBe(paths.sourceText[full]);
      }
      // At or above the index of the child through which the path continues,
      // under the product root and under the ancestor node.
      for (const unselected of [paths.higherProductDecisionPath, paths.higherAncestorDecisionPath]) {
        expect(entryPaths(entries), unselected).not.toContain(unselected);
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
      // The explicit target's own decisions are unfiltered by index, while the
      // product root's decision above the target's index stays out.
      for (const full of [paths.ancestorDecisionPath, paths.higherAncestorDecisionPath]) {
        expect(documentAt(rootEntries, full)?.content, full).toBe(paths.sourceText[full]);
      }
      expect(entryPaths(rootEntries)).not.toContain(paths.higherProductDecisionPath);
    });
  });

  it("selects the same path-governing decisions in list's decision role and in show's decision documents for a targeted target", async () => {
    await withRichContextEnv(async (env, paths) => {
      const manifest = await contextListManifest({ targets: [paths.targetId], cwd: env.productDir });
      const entries = await contextShowEntries({ targets: [paths.targetId], cwd: env.productDir });
      const snapshot = await env.readFilesystemSnapshot();
      // Every decision directly contained by the product root, the ancestor,
      // or the target — the containers along the target path — whether or not
      // the path-governing rule selects it.
      const pathContainerDecisions = snapshot.decisions
        .filter(({ parentId }) => [undefined, paths.rootDirectory, paths.targetId].includes(parentId))
        .map(({ ref }) => ref?.path);
      expect(pathContainerDecisions).toEqual(expect.arrayContaining([
        paths.higherProductDecisionPath,
        paths.higherAncestorDecisionPath,
      ]));
      expect(new Set(documentPaths(entries).filter((path) => pathContainerDecisions.includes(path)))).toEqual(
        new Set(readPathsForRole(manifest, SPEC_CONTEXT_READ_ROLE.DECISION)),
      );
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
