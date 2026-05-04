import { describe, expect, it } from "vitest";

import {
  DECISION_KINDS,
  type Kind,
  KIND_REGISTRY,
  NODE_KINDS,
  SPEC_TREE_CONFIG,
  SPEC_TREE_SECTION,
  specTreeConfigDescriptor,
} from "@/lib/spec-tree/config";

describe("specTreeConfigDescriptor.section", () => {
  it("names the spec-tree section of spx.config.yaml", () => {
    expect(specTreeConfigDescriptor.section).toBe(SPEC_TREE_SECTION);
  });
});

describe("specTreeConfigDescriptor.defaults", () => {
  it("carries every kind registered in KIND_REGISTRY", () => {
    const defaultKinds = Object.keys(specTreeConfigDescriptor.defaults.kinds);
    const registryKinds = Object.keys(KIND_REGISTRY);
    expect(defaultKinds.sort()).toEqual(registryKinds.sort());
  });

  it("carries the full definition for each default kind", () => {
    for (const kind of Object.keys(KIND_REGISTRY) as Kind[]) {
      expect(specTreeConfigDescriptor.defaults.kinds[kind]).toEqual(KIND_REGISTRY[kind]);
    }
  });
});

describe("specTreeConfigDescriptor.validate", () => {
  it("rejects a yaml section keyed by display label instead of kind name", () => {
    const result = specTreeConfigDescriptor.validate({
      kinds: [SPEC_TREE_CONFIG.KINDS.enabler.label],
    });

    expect(result.ok).toBe(false);
  });

  it("accepts a yaml section that selects a subset of registered kinds", () => {
    const subset = [NODE_KINDS[0], DECISION_KINDS[0]];
    const result = specTreeConfigDescriptor.validate({ kinds: subset });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.kinds).sort()).toEqual([...subset].sort());
    }
  });

  it("rejects a yaml section naming a kind not present in the registry", () => {
    const result = specTreeConfigDescriptor.validate({
      kinds: ["phantomKind"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/phantomKind/);
    }
  });

  it("returns an error rather than a partial config when the input is malformed", () => {
    const malformed = { kinds: "not-an-array" };

    const result = specTreeConfigDescriptor.validate(malformed);

    expect(result.ok).toBe(false);
  });

  it("rejects a yaml section that selects the same kind more than once", () => {
    const result = specTreeConfigDescriptor.validate({
      kinds: [NODE_KINDS[0], NODE_KINDS[0]],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/duplicate/);
    }
  });

  it("accepts the defaults round-trip; defaults validate cleanly", () => {
    const result = specTreeConfigDescriptor.validate(specTreeConfigDescriptor.defaults);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(specTreeConfigDescriptor.defaults);
    }
  });
});
