import { describe, expect, it } from "vitest";

import {
  DECISION_KINDS,
  DECISION_SUFFIXES,
  type Kind,
  KIND_REGISTRY,
  NODE_KINDS,
  NODE_SUFFIXES,
} from "@/spec/config.js";

describe("NODE_KINDS", () => {
  it("includes exactly the kinds whose category is node", () => {
    const expected = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (k) => KIND_REGISTRY[k].category === "node",
    );
    expect([...NODE_KINDS].sort()).toEqual([...expected].sort());
  });

  it("excludes every kind whose category is decision", () => {
    for (const kind of NODE_KINDS) {
      expect(KIND_REGISTRY[kind].category).toBe("node");
    }
  });
});

describe("DECISION_KINDS", () => {
  it("includes exactly the kinds whose category is decision", () => {
    const expected = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (k) => KIND_REGISTRY[k].category === "decision",
    );
    expect([...DECISION_KINDS].sort()).toEqual([...expected].sort());
  });

  it("excludes every kind whose category is node", () => {
    for (const kind of DECISION_KINDS) {
      expect(KIND_REGISTRY[kind].category).toBe("decision");
    }
  });
});

describe("suffix sub-registries", () => {
  it("NODE_SUFFIXES contains the suffix of every node kind and nothing else", () => {
    const expected = NODE_KINDS.map((k) => KIND_REGISTRY[k].suffix);
    expect([...NODE_SUFFIXES].sort()).toEqual([...expected].sort());
  });

  it("DECISION_SUFFIXES contains the suffix of every decision kind and nothing else", () => {
    const expected = DECISION_KINDS.map((k) => KIND_REGISTRY[k].suffix);
    expect([...DECISION_SUFFIXES].sort()).toEqual([...expected].sort());
  });
});
