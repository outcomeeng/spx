import { describe, expect, expectTypeOf, it } from "vitest";

import type { DecisionKind, Kind, KindDefinition, NodeKind, OutputKind } from "@/lib/spec-tree";
import { KIND_REGISTRY } from "@/lib/spec-tree";
import { kindRegistryTypeCases } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry runtime and type projections", () => {
  it.each(kindRegistryTypeCases())("projects the $kind runtime and type category", (testCase) => {
    expect(KIND_REGISTRY[testCase.kind].category).toBe(testCase.category);
    expect(testCase.exportedKinds).toContain(testCase.kind);
  });

  it("derives the public kind types from the runtime registry", () => {
    expectTypeOf<Kind>().toEqualTypeOf<keyof typeof KIND_REGISTRY>();
    expectTypeOf<NodeKind>().toExtend<Kind>();
    expectTypeOf<DecisionKind>().toExtend<Kind>();
    expectTypeOf<NodeKind | OutputKind | DecisionKind>().toEqualTypeOf<Kind>();
    expectTypeOf<KindDefinition<NodeKind>>().toEqualTypeOf<(typeof KIND_REGISTRY)[NodeKind]>();
    expectTypeOf<KindDefinition<DecisionKind>>().toEqualTypeOf<(typeof KIND_REGISTRY)[DecisionKind]>();
  });
});
