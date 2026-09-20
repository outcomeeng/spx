import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  projectVerifyRun,
  validateAuditTerminal,
  VERIFY_FINDING_DISPOSITION,
  VERIFY_SCOPE_TYPE,
  type VerifyFindingDisposition,
} from "@/domains/verify/verify";
import {
  arbitraryAuditChangesetProjectionScenario,
  arbitraryFileAuditScopeScenario,
} from "@testing/generators/verify/audit";
import { sampleVerifyTestValue } from "@testing/generators/verify/verify";

describe("audit scope projection", () => {
  it("preserves nested audit units in the run projection", () => {
    expect(projectVerifyRun([
      sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).rootEvent,
      sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).specEvent,
      sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).implementationEvent,
    ])).toMatchObject({
      auditScopeUnits: [
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).rootPayload,
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).specPayload,
        sampleVerifyTestValue(arbitraryAuditChangesetProjectionScenario()).implementationPayload,
      ],
      findingCount: 0,
    });
  });

  it("represents clean audited coverage without adding a finding", () => {
    expect(projectVerifyRun([
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
    ])).toMatchObject({
      auditScopeUnits: [sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootPayload],
      findingCount: 0,
    });
  });

  it("seals approved when every finding is filed or stale, retaining each under its own disposition", () => {
    const events = [
      sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootEvent,
      ...sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).filedOrStaleFindingEvents,
    ];
    expect(validateAuditTerminal({
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      events,
      selector: {
        scopeType: VERIFY_SCOPE_TYPE.FILE,
        scopeIdentity: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      },
    })).toStrictEqual({ ok: true, value: undefined });
    const projection = projectVerifyRun(events);
    const retained = sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).filedOrStaleFindingPayloads;
    expect(projection.findingCount).toBe(retained.length);
    expect(projection.findingCounts.total).toBe(retained.length);
    expect(
      projection.findingCounts[VERIFY_FINDING_DISPOSITION.FILED]
        + projection.findingCounts[VERIFY_FINDING_DISPOSITION.STALE],
    ).toBe(retained.length);
    expect(projection.findingCounts[VERIFY_FINDING_DISPOSITION.BLOCKING]).toBe(0);
    expect(projection.findingCounts[VERIFY_FINDING_DISPOSITION.DEBT]).toBe(0);
    expect(projection.findings[VERIFY_FINDING_DISPOSITION.BLOCKING]).toStrictEqual([]);
    expect(projection.findings[VERIFY_FINDING_DISPOSITION.DEBT]).toStrictEqual([]);
    for (const payload of retained) {
      const { severity } = payload as { readonly severity: VerifyFindingDisposition };
      expect(projection.findings[severity].map((finding) => finding.payload)).toContainEqual(payload);
    }
  });
});
