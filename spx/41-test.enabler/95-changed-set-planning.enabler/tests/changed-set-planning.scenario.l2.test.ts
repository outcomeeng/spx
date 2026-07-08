import { describe, it } from "vitest";

import { assertChangedSetPlanningCommandPathRunsAffectedTests } from "@testing/harnesses/testing/changed-set-planning";

describe("changed-set planning command path", () => {
  it("runs only tests affected by the branch diff and records fresh evidence", async () => {
    await assertChangedSetPlanningCommandPathRunsAffectedTests();
  });
});
