import { describe, it } from "vitest";

import {
  assertChangedPathsStayOutsideContextDigest,
  assertChangesetReconstructionChangesContextDigest,
  assertChangesetScopeDerivesChangedFiles,
  assertRunLocatorMapsResolvedSelectors,
} from "@testing/harnesses/verify/harness";

describe("verify changeset scope properties", () => {
  it("resolves any changeset into the derived changed-file scope", async () => {
    await assertChangesetScopeDerivesChangedFiles();
  });

  it("maps base and head into distinct context digests", async () => {
    await assertChangesetReconstructionChangesContextDigest();
  });

  it("keeps derived changed paths outside the canonical context", async () => {
    await assertChangedPathsStayOutsideContextDigest();
  });

  it("maps resolved selectors and run target to the reported run token", async () => {
    await assertRunLocatorMapsResolvedSelectors();
  });
});
