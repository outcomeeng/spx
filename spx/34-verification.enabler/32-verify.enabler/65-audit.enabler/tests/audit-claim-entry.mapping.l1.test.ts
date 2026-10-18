import { describe, expect, it } from "vitest";

import { auditClaimEntry } from "@/domains/verify/audit-claim-entry";
import { auditClaimEntryMappingCases } from "@testing/generators/verify/audit-claim-entry";

describe("sealed audit run to claim entry", () => {
  it.each(auditClaimEntryMappingCases())("maps $title", ({ run, node, expected }) => {
    const entry = auditClaimEntry(run, node);
    const withoutVerdict = entry === undefined ? undefined : (({ verdict: _verdict, ...rest }) => rest)(entry);
    expect(withoutVerdict).toStrictEqual(expected);
  });
});
