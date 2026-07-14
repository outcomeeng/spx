import { describe, it } from "vitest";

import {
  assertExportedClaimBacksDoingSession,
  assertSessionStoreSnapshotMapping,
} from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("the session-store snapshot mapping joins doing sessions to live worktree claims", () => {
  it("reports orphaned doing-session counts without degrading store health", assertSessionStoreSnapshotMapping);
  it("joins an exported live claim to its doing session", assertExportedClaimBacksDoingSession);
});
