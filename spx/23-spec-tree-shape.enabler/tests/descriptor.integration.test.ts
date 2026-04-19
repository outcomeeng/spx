import { describe, expect, it } from "vitest";

import { type Kind, KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config.js";

describe("specTreeConfigDescriptor.section", () => {
  it("names the spec-tree section of spx.config.yaml", () => {
    expect(specTreeConfigDescriptor.section).toBe("specTree");
  });
});

describe("specTreeConfigDescriptor.defaults", () => {
  it("carries every kind registered in KIND_REGISTRY", () => {
    const defaultKinds = Object.keys(specTreeConfigDescriptor.defaults.kinds);
    const registryKinds = Object.keys(KIND_REGISTRY);
    expect(defaultKinds.sort()).toEqual(registryKinds.sort());
  });

  it("carries the full definition — category and suffix — for each default kind", () => {
    for (const kind of Object.keys(KIND_REGISTRY) as Kind[]) {
      expect(specTreeConfigDescriptor.defaults.kinds[kind]).toEqual(KIND_REGISTRY[kind]);
    }
  });
});

describe("specTreeConfigDescriptor.validate", () => {
  it("accepts a yaml section that selects a subset of registered kinds", () => {
    const result = specTreeConfigDescriptor.validate({
      kinds: { enabler: KIND_REGISTRY.enabler, adr: KIND_REGISTRY.adr },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.kinds).sort()).toEqual(["adr", "enabler"]);
    }
  });

  it("rejects a yaml section naming a kind not present in the registry", () => {
    const result = specTreeConfigDescriptor.validate({
      kinds: { phantomKind: { category: "node", suffix: ".phantom" } },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/phantomKind/);
    }
  });

  it("returns an error rather than a partial config when the input is malformed", () => {
    const malformed = { kinds: "not-an-object" };

    const result = specTreeConfigDescriptor.validate(malformed);

    expect(result.ok).toBe(false);
  });

  it("accepts the defaults round-trip — defaults validate cleanly", () => {
    const result = specTreeConfigDescriptor.validate(specTreeConfigDescriptor.defaults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(specTreeConfigDescriptor.defaults);
    }
  });
});
