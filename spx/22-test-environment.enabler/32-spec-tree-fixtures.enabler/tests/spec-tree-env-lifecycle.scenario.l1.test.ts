import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeProjectedNode,
  type SpecTreeSource,
  type SpecTreeSourceEntry,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleSpecTreeTestValue, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withSpecTreeEnv lifecycle", () => {
  it("provides working spec-tree helpers over a representative fixture and removes the temp product directory after callback return", async () => {
    const otherFixture = sampleSpecTreeTestValue(
      SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
      1,
    );
    let observedProductDir = "";

    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      observedProductDir = env.productDir;
      expect(existsSync(env.productDir)).toBe(true);

      const { fixture } = env;
      expect(fixture.entries).toEqual([
        fixture.product,
        fixture.root,
        fixture.child,
        fixture.peer,
        fixture.decision,
        fixture.childEvidence,
        fixture.peerEvidence,
      ]);
      expect(new Set(fixture.entries.map((entry) => entry.id)).size).toBe(fixture.entries.length);
      expect(fixture.product.type).toBe(SPEC_TREE_ENTRY_TYPE.PRODUCT);
      expect(fixture.product.title.length).toBeGreaterThan(0);
      for (const node of [fixture.root, fixture.child, fixture.peer]) {
        expect(node.type).toBe(SPEC_TREE_ENTRY_TYPE.NODE);
        expect(node.slug.length).toBeGreaterThan(0);
      }
      expect(fixture.root.parentId).toBeUndefined();
      expect(fixture.peer.parentId).toBeUndefined();
      expect(fixture.child.parentId).toBe(fixture.root.id);
      expect(fixture.decision.type).toBe(SPEC_TREE_ENTRY_TYPE.DECISION);
      expect(fixture.decision.parentId).toBe(fixture.root.id);
      expect(fixture.childEvidence.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
      expect(fixture.childEvidence.parentId).toBe(fixture.child.id);
      expect(fixture.peerEvidence.type).toBe(SPEC_TREE_ENTRY_TYPE.EVIDENCE);
      expect(fixture.peerEvidence.parentId).toBe(fixture.peer.id);

      expect(await collectEntries(env.memorySource())).toEqual(fixture.entries);
      expect(await collectEntries(env.memorySource(otherFixture))).toEqual(otherFixture.entries);

      const memorySnapshot = await env.readMemorySnapshot();
      expect(memorySnapshot.product?.title).toBe(fixture.product.title);
      expect(memorySnapshot.allNodes.map((node) => node.id)).toEqual([
        fixture.root.id,
        fixture.child.id,
        fixture.peer.id,
      ]);
      expect(memorySnapshot.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
      expect((await env.readMemorySnapshot(otherFixture)).allNodes.map((node) => node.id)).toEqual([
        otherFixture.root.id,
        otherFixture.child.id,
        otherFixture.peer.id,
      ]);

      const memoryProjection = await env.projectMemory();
      expect(memoryProjection.product?.title).toBe(fixture.product.title);
      expect(flattenNodes(memoryProjection.nodes).map((node) => node.id)).toEqual([
        fixture.root.id,
        fixture.child.id,
        fixture.peer.id,
      ]);
      expect(memoryProjection.decisions.map((decision) => decision.slug)).toEqual([fixture.decision.slug]);
      expect((await env.projectMemory(otherFixture)).product?.title).toBe(otherFixture.product.title);

      await expect(env.materialize()).resolves.toBeUndefined();

      const filesystemEntries = await collectEntries(env.filesystemSource());
      expect(filesystemEntries.filter((entry) => entry.type === SPEC_TREE_ENTRY_TYPE.PRODUCT).map(titleOf)).toEqual([
        fixture.product.title,
      ]);
      expect(slugsOfType(filesystemEntries, SPEC_TREE_ENTRY_TYPE.NODE)).toEqual(
        [fixture.root.slug, fixture.child.slug, fixture.peer.slug].sort(compareAsciiStrings),
      );
      expect(slugsOfType(filesystemEntries, SPEC_TREE_ENTRY_TYPE.DECISION)).toEqual([fixture.decision.slug]);
      const filesystemNodeSlugs = new Map<string, string>(
        filesystemEntries.flatMap((entry) =>
          entry.type === SPEC_TREE_ENTRY_TYPE.NODE ? [[entry.id, entry.slug] as const] : []
        ),
      );
      expect(
        filesystemEntries
          .flatMap((entry) =>
            entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE
              ? [filesystemNodeSlugs.get(entry.parentId) ?? entry.parentId]
              : []
          )
          .sort(compareAsciiStrings),
      ).toEqual([fixture.child.slug, fixture.peer.slug].sort(compareAsciiStrings));

      const filesystemSnapshot = await env.readFilesystemSnapshot();
      expect(filesystemSnapshot.product?.title).toBe(fixture.product.title);
      expect(filesystemSnapshot.allNodes.map((node) => node.slug)).toEqual([
        fixture.root.slug,
        fixture.child.slug,
        fixture.peer.slug,
      ]);
      expect(filesystemSnapshot.decisions.map((decision) => decision.slug)).toEqual([fixture.decision.slug]);

      const filesystemProjection = await env.projectFilesystem();
      expect(filesystemProjection.product?.title).toBe(fixture.product.title);
      expect(flattenNodes(filesystemProjection.nodes).map((node) => node.slug)).toEqual([
        fixture.root.slug,
        fixture.child.slug,
        fixture.peer.slug,
      ]);
      expect(filesystemProjection.decisions.map((decision) => decision.slug)).toEqual([fixture.decision.slug]);
    });

    expect(observedProductDir.length).toBeGreaterThan(0);
    expect(existsSync(observedProductDir)).toBe(false);
  });
});

async function collectEntries(source: SpecTreeSource): Promise<readonly SpecTreeSourceEntry[]> {
  const entries: SpecTreeSourceEntry[] = [];
  for await (const entry of source.entries()) {
    entries.push(entry);
  }
  return entries;
}

function titleOf(entry: SpecTreeSourceEntry): string | undefined {
  return entry.type === SPEC_TREE_ENTRY_TYPE.PRODUCT ? entry.title : undefined;
}

function slugsOfType(
  entries: readonly SpecTreeSourceEntry[],
  type: typeof SPEC_TREE_ENTRY_TYPE.NODE | typeof SPEC_TREE_ENTRY_TYPE.DECISION,
): readonly string[] {
  return entries
    .flatMap((entry) =>
      entry.type === type && (entry.type === SPEC_TREE_ENTRY_TYPE.NODE || entry.type === SPEC_TREE_ENTRY_TYPE.DECISION)
        ? [entry.slug]
        : []
    )
    .sort(compareAsciiStrings);
}

function flattenNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);
}
