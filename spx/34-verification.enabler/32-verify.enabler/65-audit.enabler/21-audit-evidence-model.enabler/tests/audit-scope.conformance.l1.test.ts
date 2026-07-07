import { describe, it } from "vitest";

import { assertAuditScopePayloadsConformToSchema } from "@testing/harnesses/verify/harness";

describe("audit scope payload conformance", () => {
  it("accepts nestable audit units with producer identity, provenance, coverage, and prior-context partitions", async () => {
    await assertAuditScopePayloadsConformToSchema();
  });
});
