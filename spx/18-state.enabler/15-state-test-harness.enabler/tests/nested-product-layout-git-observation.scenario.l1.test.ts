import { describe, expect, it } from "vitest";

import { GIT_DIR_BASENAME } from "@/lib/git/root";
import { withAncestorRepositoryChild } from "@testing/harnesses/state/nested-product-layout";

describe("state test harness — git directory observation beneath an ancestor repository", () => {
  it("reports no git directory until a repository is initialized at the root, then reports the local one", async () => {
    await withAncestorRepositoryChild(async (child) => {
      expect(await child.observeGitDir()).toBeNull();

      await child.initializeRepository();

      expect(await child.observeGitDir()).toBe(GIT_DIR_BASENAME);
    });
  });
});
