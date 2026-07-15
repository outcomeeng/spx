import { describe, it } from "vitest";

import {
  assertInvalidTestFindingRejectedBeforeAppend,
  assertInvalidTestScopeRejectedBeforeAppend,
  assertTestTerminalRejectsAgenticDisposition,
  assertTestTerminalRejectsPassedWithFindings,
  assertTestTerminalRejectsSuppliedMetadata,
} from "@testing/harnesses/verify/harness";

describe("test evidence validation", () => {
  it("rejects invalid test scope payloads before append", async () => {
    await assertInvalidTestScopeRejectedBeforeAppend();
  });

  it("rejects invalid test finding payloads before append", async () => {
    await assertInvalidTestFindingRejectedBeforeAppend();
  });

  it("rejects an agentic terminal disposition, sealing only with a runner-mapped status", async () => {
    await assertTestTerminalRejectsAgenticDisposition();
  });

  it("rejects supplied terminal metadata, since a deterministic run produces none", async () => {
    await assertTestTerminalRejectsSuppliedMetadata();
  });

  it("rejects a passed terminal when findings exist, since a passing run produces none", async () => {
    await assertTestTerminalRejectsPassedWithFindings();
  });
});
