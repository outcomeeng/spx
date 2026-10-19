import { describe, expect, it } from "vitest";

import { type Kind, KIND_REGISTRY } from "@/lib/spec-tree";
import { kindSubregistryCases } from "@testing/generators/spec-tree/filename-grammar";

describe("kind registry subsets", () => {
  it.each(kindSubregistryCases())("projects the $category registry subset", (subregistry) => {
    const registered = (Object.keys(KIND_REGISTRY) as Kind[]).filter(
      (kind) => KIND_REGISTRY[kind].category === subregistry.category,
    );

    expect(new Set(subregistry.kinds)).toEqual(new Set(registered));
    expect(new Set(subregistry.suffixes)).toEqual(new Set(registered.map((kind) => KIND_REGISTRY[kind].suffix)));
  });
});
