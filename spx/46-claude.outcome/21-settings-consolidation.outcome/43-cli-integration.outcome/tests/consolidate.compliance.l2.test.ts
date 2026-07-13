import { assertConsolidateRejectsMutuallyExclusiveOutputs } from "@testing/harnesses/claude/permissions/consolidate-cli";
import { describe, it } from "vitest";

describe("spx claude settings consolidate output selection", () => {
  it("rejects simultaneous write and output-file modes", async () => {
    await assertConsolidateRejectsMutuallyExclusiveOutputs();
  });
});
