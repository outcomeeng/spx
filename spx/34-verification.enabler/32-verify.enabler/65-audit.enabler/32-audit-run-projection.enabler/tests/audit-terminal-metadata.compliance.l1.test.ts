import { describe, it } from "vitest";

import { assertAuditRejectsSuppliedTerminalMetadata } from "@testing/harnesses/verify/harness";

describe("audit terminal metadata", () => {
  it("rejects supplied terminal metadata", async () => {
    await assertAuditRejectsSuppliedTerminalMetadata();
  });
});
