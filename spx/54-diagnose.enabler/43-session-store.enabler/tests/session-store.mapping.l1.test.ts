import { describe, it } from "vitest";

import {
  assertDoingSessionClaimMapping,
  assertSessionStoreClassificationMapping,
} from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("the session-store check classifies the store from sessions joined to occupancy", () => {
  it("maps successful readings to healthy and errored readings to unknown", assertSessionStoreClassificationMapping);
  it("maps live claim identities to the doing sessions they back", assertDoingSessionClaimMapping);
});
