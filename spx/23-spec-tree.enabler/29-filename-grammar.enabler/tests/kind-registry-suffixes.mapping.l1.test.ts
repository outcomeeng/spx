import { describe, expect, it } from "vitest";

import { KIND_REGISTRY } from "@/lib/spec-tree";
import { kindRegistrySuffixCases } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry suffix uniqueness", () => {
  it.each(kindRegistrySuffixCases())("holds for $title", (testCase) => {
    const suffixes = testCase.kinds.map((kind) => KIND_REGISTRY[kind].suffix);

    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});
