import { describe, expect, it } from "vitest";

import { OUTPUT_FORMAT, renderSpecStatus } from "@/commands/spec/status";
import { KIND_REGISTRY, projectSpecTree, readSpecTree, SPEC_TREE_PROJECTION } from "@/lib/spec-tree";
import { buildRepresentativeFixture, createSource } from "@testing/generators/spec-tree/spec-tree";

type JsonObject = Readonly<Record<string, unknown>>;

function memberSet(value: unknown): ReadonlySet<string> {
  return new Set(Object.keys(value as JsonObject));
}

function contractSet(keys: Readonly<Record<string, string>>): ReadonlySet<string> {
  return new Set(Object.values(keys));
}

describe("spec status JSON rendering", () => {
  it("conforms to the published SpecTreeProjection key contract at every level of the document", async () => {
    const fixture = buildRepresentativeFixture(KIND_REGISTRY);
    const output = renderSpecStatus(
      projectSpecTree(await readSpecTree({ source: createSource(fixture.entries) })),
      OUTPUT_FORMAT.JSON,
    );
    // The platform parser reads the document; the source-owned key contract,
    // not the renderer, decides which members each object carries.
    const document = JSON.parse(output) as JsonObject;
    expect(memberSet(document)).toEqual(contractSet(SPEC_TREE_PROJECTION.KEYS));
    expect(document[SPEC_TREE_PROJECTION.KEYS.VERSION]).toBe(SPEC_TREE_PROJECTION.VERSION);

    const product = document[SPEC_TREE_PROJECTION.KEYS.PRODUCT] as JsonObject;
    expect(memberSet(product)).toEqual(contractSet(SPEC_TREE_PROJECTION.PRODUCT_KEYS));
    expect(product[SPEC_TREE_PROJECTION.PRODUCT_KEYS.ID]).toBe(fixture.product.id);
    expect(product[SPEC_TREE_PROJECTION.PRODUCT_KEYS.TITLE]).toBe(fixture.product.title);

    const nodes: JsonObject[] = [];
    const visit = (members: unknown): void => {
      for (const node of members as readonly JsonObject[]) {
        nodes.push(node);
        visit(node[SPEC_TREE_PROJECTION.NODE_KEYS.CHILDREN]);
      }
    };
    visit(document[SPEC_TREE_PROJECTION.KEYS.NODES]);
    const fixtureIds = [fixture.root.id, fixture.child.id, fixture.peer.id];
    expect(nodes).toHaveLength(fixtureIds.length);
    expect(new Set(nodes.map((node) => node[SPEC_TREE_PROJECTION.NODE_KEYS.ID]))).toEqual(new Set(fixtureIds));
    for (const node of nodes) {
      expect(memberSet(node), String(node[SPEC_TREE_PROJECTION.NODE_KEYS.ID])).toEqual(
        contractSet(SPEC_TREE_PROJECTION.NODE_KEYS),
      );
    }
    const child = nodes.find((node) => node[SPEC_TREE_PROJECTION.NODE_KEYS.ID] === fixture.child.id);
    expect(child).toMatchObject({
      [SPEC_TREE_PROJECTION.NODE_KEYS.KIND]: fixture.child.kind,
      [SPEC_TREE_PROJECTION.NODE_KEYS.ORDER]: fixture.child.order,
      [SPEC_TREE_PROJECTION.NODE_KEYS.SLUG]: fixture.child.slug,
    });

    const decisions = document[SPEC_TREE_PROJECTION.KEYS.DECISIONS] as readonly JsonObject[];
    expect(decisions).toHaveLength(1);
    expect(memberSet(decisions[0])).toEqual(contractSet(SPEC_TREE_PROJECTION.DECISION_KEYS));
    expect(decisions[0]).toEqual({
      [SPEC_TREE_PROJECTION.DECISION_KEYS.ID]: fixture.decision.id,
      [SPEC_TREE_PROJECTION.DECISION_KEYS.KIND]: fixture.decision.kind,
      [SPEC_TREE_PROJECTION.DECISION_KEYS.ORDER]: fixture.decision.order,
      [SPEC_TREE_PROJECTION.DECISION_KEYS.SLUG]: fixture.decision.slug,
    });
  });
});
