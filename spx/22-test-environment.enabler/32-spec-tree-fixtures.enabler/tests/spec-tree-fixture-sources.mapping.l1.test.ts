import { describe, expect, it } from "vitest";

import {
  KIND_REGISTRY,
  SPEC_TREE_ENTRY_TYPE,
  type SpecTreeNode,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  SPEC_TREE_FIXTURE_ENTRY_ROLE,
  SPEC_TREE_FIXTURE_ENTRY_ROLES,
} from "@testing/generators/spec-tree/spec-tree-fixtures";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

/** A node or decision identified by its slug and the slugs of the nodes above it, never by a source-specific id. */
type StructuralSignature = {
  readonly path: readonly string[];
  readonly kind: string;
  readonly order: readonly number[];
  readonly childCount?: number;
};

type SourceObservation = {
  readonly projection: SpecTreeProjection;
  readonly snapshot: SpecTreeSnapshot;
};

describe("withSpecTreeEnv source projections", () => {
  it.each(SPEC_TREE_FIXTURE_ENTRY_ROLES)(
    "maps the materialized %s entry of a generated fixture to the same structure as its in-memory source",
    async (role) => {
      await assertProperty(
        SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
        async (generated) => {
          await withSpecTreeEnv(
            MINIMAL_SPEC_TREE_CONFIG,
            async (env) => {
              await env.materialize();
              const memory: SourceObservation = {
                projection: await env.projectMemory(),
                snapshot: await env.readMemorySnapshot(),
              };
              const filesystem: SourceObservation = {
                projection: await env.projectFilesystem(),
                snapshot: await env.readFilesystemSnapshot(),
              };
              const { fixture } = env;

              switch (role) {
                case SPEC_TREE_FIXTURE_ENTRY_ROLE.PRODUCT:
                  expect(memory.projection.product?.title).toBe(fixture.product.title);
                  expect(filesystem.projection.product?.title).toBe(memory.projection.product?.title);
                  break;
                case SPEC_TREE_FIXTURE_ENTRY_ROLE.ROOT:
                case SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD:
                case SPEC_TREE_FIXTURE_ENTRY_ROLE.PEER: {
                  const expected = nodeSignature(memory.projection, fixture[role].id);
                  expect(expected?.path.at(-1)).toBe(fixture[role].slug);
                  expect(nodeSignatureAt(filesystem.projection, expected?.path ?? [])).toEqual(expected);
                  expect(projectedSignatures(filesystem.projection.nodes, []).map((entry) => entry.signature)).toEqual(
                    projectedSignatures(memory.projection.nodes, []).map((entry) => entry.signature),
                  );
                  break;
                }
                case SPEC_TREE_FIXTURE_ENTRY_ROLE.DECISION: {
                  const expected = decisionSignatures(memory.snapshot);
                  expect(expected.map((signature) => signature.path)).toEqual([
                    [fixture.root.slug, fixture.decision.slug],
                  ]);
                  expect(decisionSignatures(filesystem.snapshot)).toEqual(expected);
                  expect(filesystem.projection.decisions.map((decision) => decision.slug)).toEqual(
                    memory.projection.decisions.map((decision) => decision.slug),
                  );
                  break;
                }
                case SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD_EVIDENCE:
                case SPEC_TREE_FIXTURE_ENTRY_ROLE.PEER_EVIDENCE: {
                  const parent = role === SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD_EVIDENCE ? fixture.child : fixture.peer;
                  const memoryParentPaths = evidenceParentPaths(memory.snapshot);
                  expect(memoryParentPaths.filter((path) => path.at(-1) === parent.slug)).toHaveLength(1);
                  expect(evidenceParentPaths(filesystem.snapshot)).toEqual(memoryParentPaths);
                  break;
                }
              }
            },
            { fixture: generated },
          );
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});

function nodeSignature(projection: SpecTreeProjection, id: string): StructuralSignature | undefined {
  return projectedSignatures(projection.nodes, []).find((entry) => entry.id === id)?.signature;
}

function nodeSignatureAt(projection: SpecTreeProjection, path: readonly string[]): StructuralSignature | undefined {
  return projectedSignatures(projection.nodes, []).find((entry) =>
    JSON.stringify(entry.signature.path) === JSON.stringify(path)
  )
    ?.signature;
}

function projectedSignatures(
  nodes: readonly SpecTreeProjectedNode[],
  ancestors: readonly string[],
): readonly { readonly id: string; readonly signature: StructuralSignature }[] {
  return nodes.flatMap((node) => {
    const path = [...ancestors, node.slug];
    return [
      { id: node.id, signature: { path, kind: node.kind, order: node.order, childCount: node.children.length } },
      ...projectedSignatures(node.children, path),
    ];
  });
}

function slugPaths(snapshot: SpecTreeSnapshot): ReadonlyMap<string, readonly string[]> {
  const byId = new Map<string, SpecTreeNode>(snapshot.allNodes.map((node) => [node.id, node]));
  const pathOf = (node: SpecTreeNode): readonly string[] => {
    const parent = node.parentId === undefined ? undefined : byId.get(node.parentId);
    return parent === undefined ? [node.slug] : [...pathOf(parent), node.slug];
  };
  return new Map(snapshot.allNodes.map((node) => [node.id, pathOf(node)]));
}

function decisionSignatures(snapshot: SpecTreeSnapshot): readonly StructuralSignature[] {
  const paths = slugPaths(snapshot);
  return snapshot.decisions.map((decision) => ({
    path: [...(decision.parentId === undefined ? [] : paths.get(decision.parentId) ?? []), decision.slug],
    kind: decision.kind,
    order: decision.orderSegments,
  }));
}

/** The slug path of each evidence entry's parent node, in ascending order of the joined path. */
function evidenceParentPaths(snapshot: SpecTreeSnapshot): readonly (readonly string[])[] {
  const paths = slugPaths(snapshot);
  return snapshot.entries
    .flatMap((entry) => entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE ? [paths.get(entry.parentId) ?? []] : [])
    .sort((left, right) => compareAsciiStrings(JSON.stringify(left), JSON.stringify(right)));
}
