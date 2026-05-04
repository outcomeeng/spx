import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DECISION_KINDS,
  type DecisionKind,
  type Kind,
  KIND_REGISTRY,
  type KindDefinition,
  NODE_KINDS,
  type NodeKind,
  SPEC_TREE_KIND_CATEGORY,
} from "@/lib/spec-tree/config";

describe("types match values", () => {
  it("Kind is the union of KIND_REGISTRY's keys and is enumerable at the type level", () => {
    expectTypeOf<Kind>().toEqualTypeOf<keyof typeof KIND_REGISTRY>();
  });

  it("NodeKind is a subset of Kind", () => {
    expectTypeOf<NodeKind>().toExtend<Kind>();
  });

  it("DecisionKind is a subset of Kind", () => {
    expectTypeOf<DecisionKind>().toExtend<Kind>();
  });

  it("NodeKind and DecisionKind together equal Kind; every kind is categorized", () => {
    expectTypeOf<NodeKind | DecisionKind>().toEqualTypeOf<Kind>();
  });

  it("KindDefinition<K> projects to the registry entry for K — verified for node and decision union types", () => {
    expectTypeOf<KindDefinition<NodeKind>>().toEqualTypeOf<(typeof KIND_REGISTRY)[NodeKind]>();
    expectTypeOf<KindDefinition<DecisionKind>>().toEqualTypeOf<(typeof KIND_REGISTRY)[DecisionKind]>();
  });

  it("every runtime NODE_KINDS member is assignable to NodeKind at the value level", () => {
    for (const kind of NODE_KINDS) {
      const value: NodeKind = kind;
      expect(KIND_REGISTRY[value].category).toBe(SPEC_TREE_KIND_CATEGORY.NODE);
    }
  });

  it("every runtime DECISION_KINDS member is assignable to DecisionKind at the value level", () => {
    for (const kind of DECISION_KINDS) {
      const value: DecisionKind = kind;
      expect(KIND_REGISTRY[value].category).toBe(SPEC_TREE_KIND_CATEGORY.DECISION);
    }
  });
});
