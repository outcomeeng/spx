import { describe, it } from "vitest";

import { assertAuditPriorContextSelectorsFilterScopeUnits } from "@testing/harnesses/verify/harness";

describe("audit prior-context selectors", () => {
  it("filters prior context by every audit selector field", async () => {
    await assertAuditPriorContextSelectorsFilterScopeUnits();
  });
});
