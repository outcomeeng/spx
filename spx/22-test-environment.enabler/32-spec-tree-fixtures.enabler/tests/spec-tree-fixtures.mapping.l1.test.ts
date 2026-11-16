import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, readSpecTree } from "@/lib/spec-tree";
import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { createSource, SPEC_TREE_TEST_GENERATOR } from "@testing/generators/spec-tree/spec-tree";
import {
  injectedKindRegistryCases,
  SPEC_TREE_FIXTURE_ENTRY_ROLE,
  SPEC_TREE_FIXTURE_ENTRY_ROLES,
  SPEC_TREE_FIXTURES_TEST_GENERATOR,
  SUPPORT_PLACEMENT,
} from "@testing/generators/spec-tree/spec-tree-fixtures";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  PROPERTY_LEVEL,
  propertyTestEnvelopeTimeoutMs,
} from "@testing/harnesses/property/property";
import { findReusedNodeLocalSupportFiles } from "@testing/harnesses/spec-tree/fixture-placement";
import { withSpecTreeEnv, withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("spec-tree fixture generator", () => {
  it.each(SPEC_TREE_FIXTURE_ENTRY_ROLES)(
    "generates a %s entry that readSpecTree accepts in its place in the tree",
    async (role) => {
      await assertProperty(
        SPEC_TREE_TEST_GENERATOR.representativeFixture(KIND_REGISTRY),
        async (fixture) => {
          const snapshot = await readSpecTree({ source: createSource(fixture.entries) });
          const nodeById = (id: string) => snapshot.allNodes.find((node) => node.id === id);

          switch (role) {
            case SPEC_TREE_FIXTURE_ENTRY_ROLE.PRODUCT:
              expect(snapshot.product).toMatchObject({ id: fixture.product.id, title: fixture.product.title });
              break;
            case SPEC_TREE_FIXTURE_ENTRY_ROLE.ROOT:
            case SPEC_TREE_FIXTURE_ENTRY_ROLE.PEER:
              expect(snapshot.nodes.map((node) => node.id)).toContain(fixture[role].id);
              expect(nodeById(fixture[role].id)).toMatchObject({
                kind: fixture[role].kind,
                slug: fixture[role].slug,
                orderSegments: fixture[role].orderSegments,
                title: fixture[role].title,
              });
              break;
            case SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD:
              expect(nodeById(fixture.root.id)?.children.map((node) => node.id)).toEqual([fixture.child.id]);
              expect(nodeById(fixture.child.id)).toMatchObject({
                kind: fixture.child.kind,
                slug: fixture.child.slug,
                orderSegments: fixture.child.orderSegments,
                parentId: fixture.root.id,
              });
              break;
            case SPEC_TREE_FIXTURE_ENTRY_ROLE.DECISION:
              expect(snapshot.decisions.map((decision) => decision.id)).toEqual([fixture.decision.id]);
              expect(nodeById(fixture.root.id)?.decisions).toEqual([
                expect.objectContaining({
                  id: fixture.decision.id,
                  kind: fixture.decision.kind,
                  slug: fixture.decision.slug,
                  orderSegments: fixture.decision.orderSegments,
                }),
              ]);
              break;
            case SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD_EVIDENCE:
            case SPEC_TREE_FIXTURE_ENTRY_ROLE.PEER_EVIDENCE: {
              const parent = role === SPEC_TREE_FIXTURE_ENTRY_ROLE.CHILD_EVIDENCE ? fixture.child : fixture.peer;
              expect(snapshot.entries).toContainEqual(fixture[role]);
              expect(fixture[role].parentId).toBe(parent.id);
              expect(nodeById(parent.id)?.state).toBe(fixture[role].status);
              break;
            }
          }
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    },
  );
});

describe("shared spec-tree fixture values", () => {
  it("ALWAYS: no node-local support file of the product's spec tree is reused across test files", async () => {
    expect(await findReusedNodeLocalSupportFiles(PRODUCT_ROOT)).toEqual([]);
  });

  it.each(Object.values(SUPPORT_PLACEMENT))(
    "reports exactly the reused node-local support of a generated tree with %s",
    async (placement) => {
      await assertProperty(
        SPEC_TREE_FIXTURES_TEST_GENERATOR.supportPlacementScenario(placement),
        async (scenario) => {
          await withTestEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
            for (const file of scenario.files) {
              await env.writeRaw(file.path, file.contents);
            }
            expect(await findReusedNodeLocalSupportFiles(env.productDir)).toEqual(scenario.reused);
          });
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    },
    propertyTestEnvelopeTimeoutMs(PROPERTY_CLASSIFICATION.SMALL_L1),
  );
});

describe("injected kind registry", () => {
  it.each(injectedKindRegistryCases())(
    "ALWAYS: generates fixture kinds only from an injected registry with $title",
    async ({ registry, nodeKinds, decisionKinds }) => {
      assertProperty(
        SPEC_TREE_TEST_GENERATOR.representativeFixture(registry),
        (fixture) => {
          for (const node of [fixture.root, fixture.child, fixture.peer]) {
            expect(nodeKinds).toContain(node.kind);
          }
          expect(decisionKinds).toContain(fixture.decision.kind);
        },
        { level: PROPERTY_LEVEL.L1 },
      );

      await withSpecTreeEnv(
        MINIMAL_SPEC_TREE_CONFIG,
        async (env) => {
          for (const node of [env.fixture.root, env.fixture.child, env.fixture.peer]) {
            expect(nodeKinds).toContain(node.kind);
          }
          expect(decisionKinds).toContain(env.fixture.decision.kind);
        },
        { registry },
      );
    },
  );
});
