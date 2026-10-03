import { describe, expect, it } from "vitest";

import {
  OUTPUT_FORMAT,
  type OutputFormat,
  renderSpecStatus,
  SPEC_STATUS_MESSAGE,
  SPEC_STATUS_TABLE_SEPARATOR,
} from "@/commands/spec/status";
import {
  KIND_REGISTRY,
  projectSpecTree,
  readSpecTree,
  type SpecTreeProjectedNode,
  type SpecTreeProjection,
} from "@/lib/spec-tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  buildRepresentativeFixture,
  createSource,
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
          source: createSource([
            fixture.root,
            fixture.child,
            fixture.peer,
            fixture.childEvidence,
            fixture.peerEvidence,
          ]),
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
        const nodeLines = lines.filter((line) =>
          line.split(SPEC_STATUS_TABLE_SEPARATOR).flatMap((cell) => cell.trim().split(/\s+/)).includes(node.id)
        );
        expect(nodeLines, `${format} ${node.id}`).toHaveLength(1);
        expect(nodeLines[0], `${format} ${node.id}`).toContain(KIND_REGISTRY[node.kind].label);
        expect(nodeLines[0], `${format} ${node.id}`).toContain(node.state);
      }
    },
  );

  it("maps nested spec-tree projections to table rows in tree order", async () => {
    const { fixture, grandchild } = sampleGeneratedValue(
      SPEC_TREE_TEST_GENERATOR.representativeFixtureWithGrandchild(KIND_REGISTRY),
    );
    const projection = projectSpecTree(
      await readSpecTree({ source: createSource([fixture.root, fixture.child, grandchild]) }),
    );

    const table = renderSpecStatus(projection, OUTPUT_FORMAT.TABLE);

    expect(table.indexOf(fixture.root.id)).toBeLessThan(table.indexOf(fixture.child.id));
    expect(table.indexOf(fixture.child.id)).toBeLessThan(table.indexOf(grandchild.id));
  });

  it.each(Object.values(OUTPUT_FORMAT))(
    "maps a projection with decisions and no nodes to %s output: the projection document in JSON, the empty status message otherwise",
    async (format: OutputFormat) => {
      const fixture = buildRepresentativeFixture(KIND_REGISTRY);
      const projection = projectSpecTree(await readSpecTree({ source: createSource([fixture.decision]) }));
      expect(projection.nodes).toHaveLength(0);

      const output = renderSpecStatus(projection, format);

      if (format === OUTPUT_FORMAT.JSON) {
        expect(JSON.parse(output)).toEqual(projection);
        return;
      }
      expect(output).toBe(SPEC_STATUS_MESSAGE.EMPTY);
    },
  );

  it("renders the default format as text output", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(await readSpecTree({ source: createSource(fixture.entries) }));

    expect(renderSpecStatus(projection)).toBe(renderSpecStatus(projection, OUTPUT_FORMAT.TEXT));
  });

  it("rejects unsupported runtime output formats", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(await readSpecTree({ source: createSource([fixture.root]) }));
    const unsupportedFormat = sampleGeneratedValue(SPEC_TREE_TEST_GENERATOR.sourceSlug()) as OutputFormat;

    expect(() => renderSpecStatus(projection, unsupportedFormat)).toThrow(RangeError);
  });
});
