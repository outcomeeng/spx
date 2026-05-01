import { describe, expect, it } from "vitest";

import { DECISION_KINDS, type Kind, KIND_REGISTRY, NODE_KINDS, SPEC_TREE_KIND_CATEGORY } from "@/spec/config";

describe("single-source invariants", () => {
  it("every NODE_KINDS entry appears as a key in KIND_REGISTRY", () => {
    for (const kind of NODE_KINDS) {
      expect(Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind)).toBe(true);
    }
  });

  it("every DECISION_KINDS entry appears as a key in KIND_REGISTRY", () => {
    for (const kind of DECISION_KINDS) {
      expect(Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind)).toBe(true);
    }
  });

  it("NODE_KINDS and DECISION_KINDS partition KIND_REGISTRY; every key belongs to exactly one", () => {
    const registryKeys = new Set(Object.keys(KIND_REGISTRY) as Kind[]);
    const nodeSet = new Set<Kind>(NODE_KINDS);
    const decisionSet = new Set<Kind>(DECISION_KINDS);

    expect(nodeSet.size + decisionSet.size).toBe(registryKeys.size);
    for (const kind of nodeSet) {
      expect(decisionSet.has(kind)).toBe(false);
    }
    for (const kind of registryKeys) {
      expect(nodeSet.has(kind) || decisionSet.has(kind)).toBe(true);
    }
  });

  it("KIND_REGISTRY is the only runtime object declaring kind metadata; sub-registries are projections", () => {
    const nodeProjection = NODE_KINDS.map((k) => ({
      kind: k,
      category: KIND_REGISTRY[k].category,
      label: KIND_REGISTRY[k].label,
      suffix: KIND_REGISTRY[k].suffix,
      aliases: KIND_REGISTRY[k].aliases,
    }));
    const decisionProjection = DECISION_KINDS.map((k) => ({
      kind: k,
      category: KIND_REGISTRY[k].category,
      label: KIND_REGISTRY[k].label,
      suffix: KIND_REGISTRY[k].suffix,
      aliases: KIND_REGISTRY[k].aliases,
    }));

    expect(nodeProjection.every((entry) => entry.category === SPEC_TREE_KIND_CATEGORY.NODE)).toBe(true);
    expect(decisionProjection.every((entry) => entry.category === SPEC_TREE_KIND_CATEGORY.DECISION)).toBe(true);
  });
});
