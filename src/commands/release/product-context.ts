import { posix } from "node:path";

import {
  RELEASE_CONTEXT_KIND,
  type ReleaseContextDocument,
  type ReleaseContextReader,
} from "@/domains/release/product-context";
import { defaultGitDependencies } from "@/lib/git/root";
import { createTrackedPathInclusion, listTrackedPaths } from "@/lib/git/tracked-paths";
import {
  createFilesystemSpecTreeSource,
  extractDecisionCitations,
  readSpecTree,
  specContextAncestors,
  specContextDecisions,
  specContextLowerIndexSiblings,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";

/** Reads one product-context snapshot before any release agent is invoked. */
export const readReleaseProductContext: ReleaseContextReader = async (productDir, changedPaths) => {
  const trackedPaths = await listTrackedPaths(productDir, defaultGitDependencies);
  const source = createFilesystemSpecTreeSource({ productDir, includePath: createTrackedPathInclusion(trackedPaths) });
  const snapshot = await readSpecTree({ source });
  if (snapshot.product === null && snapshot.allNodes.length === 0 && snapshot.decisions.length === 0) return [];
  if (snapshot.product === null) throw new Error("Spec tree has no product specification");
  const readText = source.readText;
  if (readText === undefined) throw new Error("Product context source cannot read documents");
  const documents = new Map<string, ReleaseContextDocument>();
  const addDocument = async (kind: ReleaseContextDocument["kind"], ref: SpecTreeSourceRef | undefined) => {
    if (ref?.path === undefined) throw new Error("Product context document has no filesystem path");
    if (documents.has(ref.path)) return;
    documents.set(ref.path, { kind, path: ref.path, content: await readText(ref) });
  };
  await addDocument(RELEASE_CONTEXT_KIND.PRODUCT, snapshot.product.ref);
  for (const decision of specContextDecisions(snapshot, [])) {
    await addDocument(RELEASE_CONTEXT_KIND.DECISION, decision.ref);
  }
  for (const target of changedContextTargets(snapshot, changedPaths)) {
    const contextNodes = [...specContextAncestors(snapshot, target), target];
    for (const decision of specContextDecisions(snapshot, contextNodes)) {
      await addDocument(RELEASE_CONTEXT_KIND.DECISION, decision.ref);
    }
    for (const node of [...contextNodes, ...specContextLowerIndexSiblings(snapshot, contextNodes)]) {
      await addDocument(RELEASE_CONTEXT_KIND.SPECIFICATION, node.ref);
    }
  }
  const decisionsByPath = new Map(snapshot.decisions.map((decision) => [decision.ref?.path, decision.ref]));
  // Map iteration visits appended decisions, resolving citations transitively once per path.
  for (const document of documents.values()) {
    for (const citation of extractDecisionCitations(document.content)) {
      const ref = decisionsByPath.get(citation);
      if (ref === undefined) {
        throw new Error(`Unresolved product-context decision ${citation} cited by ${document.path}`);
      }
      await addDocument(RELEASE_CONTEXT_KIND.DECISION, ref);
    }
  }
  return Object.values(RELEASE_CONTEXT_KIND).flatMap((kind) =>
    [...documents.values()].filter((document) => document.kind === kind)
  );
};

function changedContextTargets(snapshot: SpecTreeSnapshot, changedPaths: readonly string[]): readonly SpecTreeNode[] {
  return snapshot.allNodes.filter((node) => {
    const path = node.ref?.path;
    return path !== undefined && changedPaths.some((changed) => changed.startsWith(`${posix.dirname(path)}/`));
  });
}
