import { describe, expect, it } from "vitest";

import { DECISION_KINDS, KIND_REGISTRY, NODE_KINDS } from "@/lib/spec-tree/config";

describe("suffix uniqueness", () => {
  it("no two node kinds share a directory suffix", () => {
    const suffixes = NODE_KINDS.map((kind) => KIND_REGISTRY[kind].suffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });

  it("no two decision kinds share a filename suffix", () => {
    const suffixes = DECISION_KINDS.map((kind) => KIND_REGISTRY[kind].suffix);
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });

  it("no two kinds share a suffix across categories", () => {
    const suffixes = (NODE_KINDS as readonly string[])
      .map((kind) => KIND_REGISTRY[kind as keyof typeof KIND_REGISTRY].suffix)
      .concat(
        (DECISION_KINDS as readonly string[]).map(
          (kind) => KIND_REGISTRY[kind as keyof typeof KIND_REGISTRY].suffix,
        ),
      );
    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});
