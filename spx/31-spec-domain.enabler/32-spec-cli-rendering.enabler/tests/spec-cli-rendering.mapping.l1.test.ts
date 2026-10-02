import { describe, expect, it } from "vitest";

import {
  OUTPUT_FORMAT,
  type OutputFormat,
  renderSpecStatus,
  SPEC_STATUS_MESSAGE,
} from "@/commands/spec/status";
import {
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  SPEC_TREE_PROJECTION,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
} from "@/lib/spec-tree";
import {
  buildNodeEntry,
  buildRepresentativeFixture,
  createSource,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

function flattenProjectedNodes(nodes: readonly SpecTreeProjectedNode[]): readonly SpecTreeProjectedNode[] {
  return nodes.flatMap((node) => [node, ...flattenProjectedNodes(node.children)]);
}

describe("spec status rendering", () => {
  it.each(Object.values(OUTPUT_FORMAT))(
    "maps every projected node to its registry label, node path, and derived state in %s output",
    async (format: OutputFormat) => {
      const fixture = buildRepresentativeFixture(KIND_REGISTRY);
      // Nodes at two depths with distinct evidence, so labels, paths, and
      // states differ between rows.
      const projection = projectSpecTree(
        await readSpecTree({
          source: createSource([fixture.root, fixture.child, fixture.peer, fixture.childEvidence, fixture.peerEvidence]),
        }),
      );
      const nodes = flattenProjectedNodes(projection.nodes);
      expect(nodes.length).toBeGreaterThan(2);
      const output = renderSpecStatus(projection, format);
      if (format === OUTPUT_FORMAT.JSON) {
        const parsed = flattenProjectedNodes((JSON.parse(output) as SpecTreeProjection).nodes);
        expect(parsed.map(({ id, kind, state }) => ({ id, kind, state }))).toEqual(
          nodes.map(({ id, kind, state }) => ({ id, kind, state })),
        );
        return;
      }
      // A human format gives each node one line naming its label, its path as
      // a whole token, and its state.
      const lines = output.split("\n");
      for (const node of nodes) {
        const nodeLines = lines.filter((line) => line.split(/[\s|]+/).includes(node.id));
        expect(nodeLines, `${format} ${node.id}`).toHaveLength(1);
        expect(nodeLines[0], `${format} ${node.id}`).toContain(KIND_REGISTRY[node.kind].label);
        expect(nodeLines[0], `${format} ${node.id}`).toContain(node.state);
      }
    },
  );

  it("maps nested spec-tree projections to table rows in tree order", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const grandchild = buildNodeEntry(KIND_REGISTRY, {
      id: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceId()),
      order: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.childSourceOrderAbove(fixture.child.order)),
      slug: sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()),
      parentId: fixture.child.id,
    });
    const projection = projectSpecTree(
      await readSpecTree({ source: createSource([fixture.root, fixture.child, grandchild]) }),
    );

    const table = renderSpecStatus(projection, OUTPUT_FORMAT.TABLE);

    expect(table.indexOf(fixture.root.id)).toBeLessThan(table.indexOf(fixture.child.id));
    expect(table.indexOf(fixture.child.id)).toBeLessThan(table.indexOf(grandchild.id));
  });

  it("maps empty spec-tree projections to the empty status message", async () => {
    const projection = projectSpecTree(await readSpecTree({ source: createSource([]) }));

    expect(renderSpecStatus(projection)).toBe(SPEC_STATUS_MESSAGE.EMPTY);
  });

  it("maps empty spec-tree projections to the empty status message when table format is requested", async () => {
    const projection = projectSpecTree(await readSpecTree({ source: createSource([]) }));

    expect(renderSpecStatus(projection, OUTPUT_FORMAT.TABLE)).toBe(SPEC_STATUS_MESSAGE.EMPTY);
  });

  it("maps projections with decisions and no nodes to the empty status message", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(await readSpecTree({ source: createSource([fixture.decision]) }));

    expect(renderSpecStatus(projection)).toBe(SPEC_STATUS_MESSAGE.EMPTY);
  });

  it("maps projections with no nodes to JSON projection output when JSON format is requested", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(await readSpecTree({ source: createSource([fixture.decision]) }));
    const output = renderSpecStatus(projection, OUTPUT_FORMAT.JSON);

    const parsed = JSON.parse(output) as {
      readonly version: number;
      readonly nodes: readonly unknown[];
      readonly decisions: ReadonlyArray<{ readonly id: string }>;
    };

    expect(parsed.version).toBe(SPEC_TREE_PROJECTION.VERSION);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.decisions).toMatchObject([{ id: fixture.decision.id }]);
  });

  it("rejects unsupported runtime output formats", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(await readSpecTree({ source: createSource([fixture.root]) }));
    const unsupportedFormat = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()) as OutputFormat;

    expect(() => renderSpecStatus(projection, unsupportedFormat)).toThrow(RangeError);
  });
});
