import { describe, it } from "vitest";

import {
  assertAuditFindingEmptyEvidenceRejectedBeforeAppend,
  assertAuditFindingUnknownUnitRejectedBeforeAppend,
  assertInvalidAuditFindingRejectedBeforeAppend,
  assertInvalidAuditScopeRejectedBeforeAppend,
} from "@testing/harnesses/verify/harness";

describe("audit evidence validation", () => {
  it("rejects invalid audit scope payloads before append", async () => {
    await assertInvalidAuditScopeRejectedBeforeAppend();
  });

  it("rejects invalid audit finding payloads before append", async () => {
    await assertInvalidAuditFindingRejectedBeforeAppend();
  });

  it("rejects audit findings that reference units absent from scope evidence before append", async () => {
    await assertAuditFindingUnknownUnitRejectedBeforeAppend();
  });

  it("rejects audit findings that omit observed-versus-expected evidence before append", async () => {
    await assertAuditFindingEmptyEvidenceRejectedBeforeAppend();
  });
});
