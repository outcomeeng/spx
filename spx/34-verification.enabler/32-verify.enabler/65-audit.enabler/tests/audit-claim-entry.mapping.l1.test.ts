import { describe, expect, it } from "vitest";

import { auditClaimEntries } from "@/domains/verify/audit-claim-entry";
import { auditClaimEntryMappingCases } from "@testing/generators/verify/audit-claim-entry";

describe("sealed audit run to claim entries", () => {
  it.each(auditClaimEntryMappingCases())("maps $title", ({ run, node, expected }) => {
    const withoutVerdicts = auditClaimEntries(run, node).map(({ verdict: _verdict, ...rest }) => rest);
    expect(withoutVerdicts).toStrictEqual(expected);
  });
});
