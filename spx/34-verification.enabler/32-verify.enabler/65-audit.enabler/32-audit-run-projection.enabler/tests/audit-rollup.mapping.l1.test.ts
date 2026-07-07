import { describe, it } from "vitest";

import { assertAuditTerminalRollupMapsCoverageAndFindings } from "@testing/harnesses/verify/harness";

describe("audit terminal rollup", () => {
  it("maps required coverage and findings to the audit terminal status", async () => {
    await assertAuditTerminalRollupMapsCoverageAndFindings();
  });
});
