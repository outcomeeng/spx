import { describe, expect, it } from "vitest";

import { type Kind, KIND_REGISTRY } from "@/spec/config.js";

describe("KIND_REGISTRY", () => {
  it("exposes each kind as a key whose value carries category and suffix", () => {
    for (const kind of Object.keys(KIND_REGISTRY) as Kind[]) {
      const definition = KIND_REGISTRY[kind];
      expect(typeof definition.category).toBe("string");
      expect(typeof definition.suffix).toBe("string");
    }
  });

  it("classifies enabler as a node with directory suffix .enabler", () => {
    expect(KIND_REGISTRY.enabler).toEqual({ category: "node", suffix: ".enabler" });
  });

  it("classifies outcome as a node with directory suffix .outcome", () => {
    expect(KIND_REGISTRY.outcome).toEqual({ category: "node", suffix: ".outcome" });
  });

  it("classifies adr as a decision with filename suffix .adr.md", () => {
    expect(KIND_REGISTRY.adr).toEqual({ category: "decision", suffix: ".adr.md" });
  });

  it("classifies pdr as a decision with filename suffix .pdr.md", () => {
    expect(KIND_REGISTRY.pdr).toEqual({ category: "decision", suffix: ".pdr.md" });
  });

  it("assigns exactly one category — node or decision — to every kind", () => {
    for (const kind of Object.keys(KIND_REGISTRY) as Kind[]) {
      const { category } = KIND_REGISTRY[kind];
      expect(["node", "decision"]).toContain(category);
    }
  });

  it("maps every node kind to exactly one directory suffix", () => {
    const nodeKinds = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (k) => KIND_REGISTRY[k].category === "node",
    );
    for (const kind of nodeKinds) {
      expect(KIND_REGISTRY[kind].suffix).toMatch(/^\.[a-z-]+$/);
    }
  });

  it("maps every decision kind to exactly one filename suffix ending in .md", () => {
    const decisionKinds = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (k) => KIND_REGISTRY[k].category === "decision",
    );
    for (const kind of decisionKinds) {
      expect(KIND_REGISTRY[kind].suffix).toMatch(/^\.[a-z-]+\.md$/);
    }
  });
});
