import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, renderSpecStatus } from "@/commands/spec/status";
import { KIND_REGISTRY, projectSpecTree, readSpecTree, SPEC_TREE_PROJECTION_SCHEMA } from "@/lib/spec-tree";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";

describe("spec status JSON rendering", () => {
  it("emits a document the published SpecTreeProjection schema accepts, carrying the rendered projection's values", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const projection = projectSpecTree(await readSpecTree({ source: createSource(fixture.entries) }));
    // The case reaches every contract surface: product, nested nodes, decisions.
    expect(projection.product).not.toBeNull();
    expect(projection.nodes.flatMap((node) => node.children)).not.toHaveLength(0);
    expect(projection.decisions).not.toHaveLength(0);

    const output = renderSpecStatus(projection, OUTPUT_FORMAT.JSON);

    // The library-owned contract schema, not the renderer, decides which members
    // each object carries and which values each member admits; parse rejects an
    // undeclared member, a missing member, or a value outside its domain.
    expect(SPEC_TREE_PROJECTION_SCHEMA.parse(JSON.parse(output))).toEqual(projection);
  });
});
