import { describe, it } from "vitest";

import {
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
});
