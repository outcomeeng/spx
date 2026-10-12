import { describe, expect, it } from "vitest";

import { SPEC_CONTEXT_MODE, SPEC_CONTEXT_MODE_NAME, SPEC_CONTEXT_PRODUCT_ROOT_TARGET } from "@/lib/spec-tree";
import { segmentOrderGovernanceCases } from "@testing/generators/spec-tree/segment-order-governance";
import { withSegmentOrderGovernanceEnv } from "@testing/harnesses/spec-tree/segment-order-governance";
import {
  allManifestPaths,
  contextListManifest,
  contextShowEntries,
  documentAt,
  documentPaths,
  entryPaths,
  manifestEntryAt,
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

  it("selects the same path-governing decisions in Full in list's entries and in show's decision documents for a targeted target", async () => {
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
      const listedDecisions = allManifestPaths(manifest).filter((path) => pathContainerDecisions.includes(path));
      expect(documentPaths(entries).filter((path) => pathContainerDecisions.includes(path))).toEqual(listedDecisions);
      expect(listedDecisions).toEqual([paths.ancestorDecisionPath, paths.targetDecisionPath]);
      for (const path of listedDecisions) {
        expect(manifestEntryAt(manifest, path)?.mode, path).toBe(SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL]);
      }
    });
  });

  it("renders an explicit product-root target as the product and its decisions in Full, its immediate children in Digest, and its knowledge index reference, unlike targetless discovery", async () => {
    await withRichContextEnv(async (env, paths) => {
      const entries = await contextShowEntries({ targets: [SPEC_CONTEXT_PRODUCT_ROOT_TARGET], cwd: env.productDir });
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

  for (const governance of segmentOrderGovernanceCases()) {
    it(`selects the decision at the lower index as governing the node at the higher index and not the reverse, ${governance.title}`, async () => {
      await withSegmentOrderGovernanceEnv(governance, async (env) => {
        const higherEntries = await contextShowEntries({ targets: [governance.higherTarget], cwd: env.productDir });
        const higherManifest = await contextListManifest({ targets: [governance.higherTarget], cwd: env.productDir });
        // The lower-index decision precedes the higher-index target and governs it in Full.
        expect(documentAt(higherEntries, governance.lowerDecisionPath)?.content).toBe(
          governance.files[governance.lowerDecisionPath],
        );
        expect(manifestEntryAt(higherManifest, governance.lowerDecisionPath)?.mode).toBe(
          SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.FULL],
        );
        // A decision at the target's own index is no provider of it.
        expect(entryPaths(higherEntries)).not.toContain(governance.higherDecisionPath);
        expect(allManifestPaths(higherManifest)).not.toContain(governance.higherDecisionPath);

        const lowerEntries = await contextShowEntries({ targets: [governance.lowerTarget], cwd: env.productDir });
        const lowerManifest = await contextListManifest({ targets: [governance.lowerTarget], cwd: env.productDir });
        // Neither the decision at the lower target's own index nor the one above it governs the lower target.
        for (const unselected of [governance.lowerDecisionPath, governance.higherDecisionPath]) {
          expect(entryPaths(lowerEntries), unselected).not.toContain(unselected);
          expect(allManifestPaths(lowerManifest), unselected).not.toContain(unselected);
        }
      });
    });

    it(`delivers the sibling at the other index in Digest for either target, ${governance.title}`, async () => {
      await withSegmentOrderGovernanceEnv(governance, async (env) => {
        const higherEntries = await contextShowEntries({ targets: [governance.higherTarget], cwd: env.productDir });
        const lowerEntries = await contextShowEntries({ targets: [governance.lowerTarget], cwd: env.productDir });
        expect(documentAt(higherEntries, governance.lowerSpecPath)?.content).toBeDefined();
        expect(documentAt(lowerEntries, governance.higherSpecPath)?.content).toBeDefined();
        const lowerSibling = (await contextListManifest({ targets: [governance.higherTarget], cwd: env.productDir }))
          .entries.find((entry) => entry.path === governance.lowerSpecPath);
        expect(lowerSibling?.mode).toBe(SPEC_CONTEXT_MODE_NAME[SPEC_CONTEXT_MODE.DIGEST]);
      });
    });
  }
});
