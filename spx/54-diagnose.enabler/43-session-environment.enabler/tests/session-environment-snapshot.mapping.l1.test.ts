import { describe, it } from "vitest";

import { assertSessionEnvironmentSnapshotMapping } from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("the session-environment snapshot mapping derives the current worktree occupancy", () => {
  it(
    "maps occupancy and identity combinations to session-environment verdicts",
    assertSessionEnvironmentSnapshotMapping,
  );
});
