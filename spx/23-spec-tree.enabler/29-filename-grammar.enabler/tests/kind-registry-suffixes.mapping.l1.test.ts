import { describe, expect, it } from "vitest";

import { type Kind, KIND_REGISTRY, SPEC_TREE_KIND_CATEGORY } from "@/lib/spec-tree";

const REGISTERED_KINDS = Object.keys(KIND_REGISTRY) as Kind[];

const SUFFIX_UNIQUENESS_GROUPS = [
  {
    title: "node directory suffixes",
    kinds: REGISTERED_KINDS.filter((kind) => KIND_REGISTRY[kind].category !== SPEC_TREE_KIND_CATEGORY.DECISION),
  },
  {
    title: "decision filename suffixes",
    kinds: REGISTERED_KINDS.filter((kind) => KIND_REGISTRY[kind].category === SPEC_TREE_KIND_CATEGORY.DECISION),
  },
  { title: "all registered suffixes", kinds: REGISTERED_KINDS },
] as const;

describe("kind registry suffix uniqueness", () => {
  it.each(SUFFIX_UNIQUENESS_GROUPS)("holds for $title", (group) => {
    const suffixes = group.kinds.map((kind) => KIND_REGISTRY[kind].suffix);

    expect(new Set(suffixes).size).toBe(suffixes.length);
  });
});
