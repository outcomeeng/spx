import { describe, expect, it } from "vitest";

import { validateAuditFinding } from "@/domains/verify/verify";
import { arbitraryAuditFinding } from "@testing/generators/verify/audit";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("audit finding payload conformance", () => {
  it("accepts audit findings with unit identity, producer provenance, severity, message, and evidence", async () => {
    assertProperty(
      arbitraryAuditFinding(),
      (finding) => {
        expect(validateAuditFinding(JSON.parse(JSON.stringify(finding)))).toEqual(finding);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
