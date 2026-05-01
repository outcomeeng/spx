import { describe, expect, it } from "vitest";

import { type Kind, KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_KIND_CATEGORY } from "@/lib/spec-tree/config";

describe("KIND_REGISTRY", () => {
  it("exposes each kind as a key whose value carries registry metadata", () => {
    for (const kind of Object.keys(KIND_REGISTRY) as Kind[]) {
      const definition = KIND_REGISTRY[kind];
      expect(typeof definition.category).toBe("string");
      expect(typeof definition.label).toBe("string");
      expect(typeof definition.suffix).toBe("string");
      expect(Array.isArray(definition.aliases)).toBe(true);
    }
  });

  it("derives the runtime registry from the semantic config object", () => {
    expect(KIND_REGISTRY).toBe(SPEC_TREE_CONFIG.KINDS);
  });

  it("assigns exactly one category, node or decision, to every kind", () => {
    for (const kind of Object.keys(KIND_REGISTRY) as Kind[]) {
      const { category } = KIND_REGISTRY[kind];
      expect(Object.values(SPEC_TREE_KIND_CATEGORY)).toContain(category);
    }
  });

  it("maps every node kind to exactly one directory suffix", () => {
    const nodeKinds = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (k) => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.NODE,
    );
    for (const kind of nodeKinds) {
      expect(KIND_REGISTRY[kind].suffix).toMatch(/^\.[a-z-]+$/);
    }
  });

  it("maps every decision kind to exactly one filename suffix ending in .md", () => {
    const decisionKinds = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (k) => KIND_REGISTRY[k].category === SPEC_TREE_KIND_CATEGORY.DECISION,
    );
    for (const kind of decisionKinds) {
      expect(KIND_REGISTRY[kind].suffix).toMatch(/^\.[a-z-]+\.md$/);
    }
  });
});
