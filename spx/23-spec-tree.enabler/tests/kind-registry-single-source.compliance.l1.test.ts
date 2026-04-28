import { describe, expect, it } from "vitest";

import { DECISION_KINDS, type Kind, KIND_REGISTRY, NODE_KINDS } from "@/spec/config";

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

  it("NODE_KINDS and DECISION_KINDS partition KIND_REGISTRY — every key belongs to exactly one", () => {
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

  it("KIND_REGISTRY is the only runtime object declaring kind metadata — sub-registries are projections", () => {
    const nodeProjection = NODE_KINDS.map((k) => ({
      kind: k,
      category: KIND_REGISTRY[k].category,
      suffix: KIND_REGISTRY[k].suffix,
    }));
    const decisionProjection = DECISION_KINDS.map((k) => ({
      kind: k,
      category: KIND_REGISTRY[k].category,
      suffix: KIND_REGISTRY[k].suffix,
    }));

    expect(nodeProjection.every((entry) => entry.category === "node")).toBe(true);
    expect(decisionProjection.every((entry) => entry.category === "decision")).toBe(true);
  });
});
