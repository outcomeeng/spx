import { describe, it } from "vitest";

import {
  assertExportedClaimBacksDoingSession,
  assertSessionStoreSnapshotMapping,
} from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("the session-store snapshot mapping retains informational orphan counts", () => {
  it("maps live claims to informational orphan counts without degrading health", assertSessionStoreSnapshotMapping);
  it("joins an exported live claim to its doing session", assertExportedClaimBacksDoingSession);
});
