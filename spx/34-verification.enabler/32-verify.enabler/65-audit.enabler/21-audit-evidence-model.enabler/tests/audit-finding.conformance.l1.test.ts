import { describe, it } from "vitest";

import { assertAuditFindingPayloadsConformToSchema } from "@testing/harnesses/verify/harness";

describe("audit finding payload conformance", () => {
  it("accepts audit findings with unit identity, producer provenance, severity, message, and evidence", async () => {
    await assertAuditFindingPayloadsConformToSchema();
  });
});
