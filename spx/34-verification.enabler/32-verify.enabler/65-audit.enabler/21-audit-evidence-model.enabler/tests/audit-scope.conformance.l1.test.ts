import { describe, expect, it } from "vitest";

import { validateAuditScope } from "@/domains/verify/verify";
import { arbitraryAuditScopePayload } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit scope payload conformance", () => {
  it("accepts nestable audit units with producer identity, provenance, coverage, and prior-context partitions", async () => {
    assertProperty(
      arbitraryAuditScopePayload(),
      (payload) => {
        expect(validateAuditScope(payload)).toEqual(payload);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
