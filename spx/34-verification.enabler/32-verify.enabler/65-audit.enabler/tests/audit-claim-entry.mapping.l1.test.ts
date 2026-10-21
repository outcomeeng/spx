import { describe, expect, it } from "vitest";

import { auditClaimEntries } from "@/domains/verify/audit-claim-entry";
import { auditClaimEntryMappingCases } from "@testing/generators/verify/audit-claim-entry";

describe("sealed audit run to claim entry", () => {
  it.each(auditClaimEntryMappingCases())("maps $title", ({ run, node, expected }) => {
    const entries = auditClaimEntries(run, node).map(({ verdict: _verdict, ...rest }) => rest);
    expect(entries).toStrictEqual(expected);
  });
});
