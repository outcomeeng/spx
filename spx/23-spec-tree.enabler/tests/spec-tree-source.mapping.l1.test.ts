import { describe, expect, it } from "vitest";

import { projectSpecTree, readSpecTree } from "@/spec-tree";
import { KIND_REGISTRY } from "@/spec/config";
import { buildRepresentativeEntries, createSource, withGeneratedSourceRef } from "@testing/generators/spec-tree";

describe("SpecTreeSource mappings", () => {
  it("maps source records with and without refs to equivalent projections", async () => {
    const inMemoryEntries = buildRepresentativeEntries(KIND_REGISTRY);
    const referencedEntries = inMemoryEntries.map(withGeneratedSourceRef);

    const inMemoryProjection = projectSpecTree(
      await readSpecTree({ source: createSource(inMemoryEntries) }),
    );
    const referencedProjection = projectSpecTree(
      await readSpecTree({ source: createSource(referencedEntries) }),
    );

    expect(referencedProjection).toEqual(inMemoryProjection);
  });
});
