import { describe, it } from "vitest";

import {
  assertFinishStatusAndRenderProjectTerminalMetadata,
  assertReviewTerminalMetadataStateMapsTerminalStatus,
} from "@testing/harnesses/verify/harness";

describe("review envelope projection", () => {
  it("maps terminal metadata into finish, status, and render projections", async () => {
    await assertFinishStatusAndRenderProjectTerminalMetadata();
  });

  it("maps review terminal states into terminal status", async () => {
    await assertReviewTerminalMetadataStateMapsTerminalStatus();
  });
});
