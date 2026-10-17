import { describe, expect, it } from "vitest";

import {
  DECISION_KINDS,
  DECISION_SUFFIXES,
  type Kind,
  KIND_REGISTRY,
  NODE_KINDS,
  NODE_SUFFIXES,
  OUTPUT_KINDS,
  OUTPUT_SUFFIXES,
  SPEC_TREE_KIND_CATEGORY,
} from "@/lib/spec-tree";

const EXPORTED_SUBREGISTRIES = [
  { category: SPEC_TREE_KIND_CATEGORY.NODE, kinds: NODE_KINDS, suffixes: NODE_SUFFIXES },
  { category: SPEC_TREE_KIND_CATEGORY.OUTPUT, kinds: OUTPUT_KINDS, suffixes: OUTPUT_SUFFIXES },
  { category: SPEC_TREE_KIND_CATEGORY.DECISION, kinds: DECISION_KINDS, suffixes: DECISION_SUFFIXES },
] as const;

describe("kind registry subsets", () => {
  it.each(EXPORTED_SUBREGISTRIES)("projects the $category registry subset", (subregistry) => {
    const registered = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (kind) => KIND_REGISTRY[kind].category === subregistry.category,
    );

    expect(new Set(subregistry.kinds)).toEqual(new Set(registered));
    expect(new Set(subregistry.suffixes)).toEqual(new Set(registered.map((kind) => KIND_REGISTRY[kind].suffix)));
  });
});
