import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import type { RepresentativeSpecTreeFixture } from "@testing/generators/spec-tree/spec-tree";
import { withSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("withSpecTreeEnv safety", () => {
  it("rejects materialized fixture paths that escape the temp product directory", async () => {
    await withSpecTreeEnv(MINIMAL_SPEC_TREE_CONFIG, async (env) => {
      await expect(env.materialize(withRootSlug(env.fixture, "../../../escape"))).rejects.toThrow(
        "Path escapes product directory",
      );
    });
  });
});

function withRootSlug(fixture: RepresentativeSpecTreeFixture, slug: string): RepresentativeSpecTreeFixture {
  const root = { ...fixture.root, slug };

  return {
    ...fixture,
    root,
    entries: fixture.entries.map((entry) => entry.id === root.id ? root : entry),
  };
}
