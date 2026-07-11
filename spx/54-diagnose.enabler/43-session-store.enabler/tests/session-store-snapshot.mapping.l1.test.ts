import { describe, it } from "vitest";

import {
  assertExportedClaimBacksDoingSession,
  assertSessionStoreSnapshotMapping,
} from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("the session-store snapshot mapping joins doing sessions to live worktree claims", () => {
  it("maps live claims to orphaned doing-session counts", assertSessionStoreSnapshotMapping);
  it("joins an exported live claim to its doing session", assertExportedClaimBacksDoingSession);
});
