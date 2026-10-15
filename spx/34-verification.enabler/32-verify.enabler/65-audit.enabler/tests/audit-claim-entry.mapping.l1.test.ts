import { describe, expect, it } from "vitest";

import { auditClaimEntry } from "@/domains/verify/audit-claim-entry";
import { auditClaimEntryMappingCases } from "@testing/generators/verify/audit-claim-entry";

describe("sealed audit run to claim entry", () => {
  it.each(auditClaimEntryMappingCases())("maps $title", ({ run, node, expected }) => {
    expect(auditClaimEntry(run, node)).toStrictEqual(expected);
  });
});
