import { describe, it } from "vitest";

import {
  assertVerificationEvidenceAdditionsAreNounLocal,
  assertVerificationRunNounGroupExposed,
  assertVerificationRunOptionsReachHandlers,
} from "@testing/harnesses/verify/harness";

describe("record run compliance", () => {
  it("exposes the caller-driven verification-run lifecycle under the verification run noun group", () => {
    assertVerificationRunNounGroupExposed();
  });

  it("keeps scope and finding evidence additions noun-local", () => {
    assertVerificationEvidenceAdditionsAreNounLocal();
  });

  it("passes parsed verification-run selector options to lifecycle handlers", async () => {
    await assertVerificationRunOptionsReachHandlers();
  });
});
