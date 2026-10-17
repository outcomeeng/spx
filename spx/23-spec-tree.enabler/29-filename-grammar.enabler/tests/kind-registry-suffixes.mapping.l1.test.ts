import { describe, expect, it } from "vitest";

import { KIND_REGISTRY } from "@/lib/spec-tree";
import { suffixUniquenessCases } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry suffix uniqueness", () => {
  it.each(suffixUniquenessCases())("holds for $title", (group) => {
    const suffixes = group.kinds.map((kind) => KIND_REGISTRY[kind].suffix);

    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});
