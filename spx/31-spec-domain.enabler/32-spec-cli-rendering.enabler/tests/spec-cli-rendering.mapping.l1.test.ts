import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, renderSpecStatus, SPEC_STATUS_MESSAGE, SPEC_STATUS_TABLE_HEADER } from "@/commands/spec/status";
import { projectSpecTree, readSpecTree, SPEC_TREE_NODE_STATE } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree/config";
import {
  buildNodeEntry,
  buildRepresentativeFixture,
  createSource,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
} from "@testing/generators/spec-tree/spec-tree";

describe("spec status rendering", () => {
  it("maps spec-tree projections to text, table, and markdown output", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(
      await readSpecTree({ source: createSource([fixture.root, fixture.child]) }),
    );

    const text = renderSpecStatus(projection);
    const table = renderSpecStatus(projection, OUTPUT_FORMAT.TABLE);
    const markdown = renderSpecStatus(projection, OUTPUT_FORMAT.MARKDOWN);

    expect(text).toContain(KIND_REGISTRY[fixture.root.kind].label);
    expect(text).toContain(fixture.root.id);
    expect(text).toContain(fixture.child.id);
    expect(text).toContain(SPEC_TREE_NODE_STATE.DECLARED);
    expect(table).toContain(SPEC_STATUS_TABLE_HEADER);
    expect(table).toContain(fixture.root.id);
    expect(table).toContain(fixture.child.id);
    expect(markdown).toContain(`- ${KIND_REGISTRY[fixture.root.kind].label}`);
    expect(markdown).toContain(fixture.root.id);
    expect(markdown).toContain(fixture.child.id);
  });

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

  it("maps projections with decisions and no nodes to the empty status message", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(await readSpecTree({ source: createSource([fixture.decision]) }));

    expect(renderSpecStatus(projection)).toBe(SPEC_STATUS_MESSAGE.EMPTY);
  });
});
