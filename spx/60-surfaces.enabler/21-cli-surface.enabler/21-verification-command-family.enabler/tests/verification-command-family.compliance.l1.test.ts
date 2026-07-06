import { describe, it } from "vitest";

import {
  assertVerificationEvidenceAdditionsAreNounLocal,
  assertVerificationRunNounGroupExposed,
  assertVerificationRunOptionsReachHandlers,
  assertVerificationRunPathsHideJournalMechanics,
} from "@testing/harnesses/verify/harness";

describe("verification command family compliance", () => {
  it("exposes typed verification runs under the verification run noun group", () => {
    assertVerificationRunNounGroupExposed();
  });

  it("keeps scope and finding evidence additions noun-local", () => {
    assertVerificationEvidenceAdditionsAreNounLocal();
  });

  it("keeps journal mechanics out of the public verification-run command paths", () => {
    assertVerificationRunPathsHideJournalMechanics();
  });

  it("passes parsed verification-run selector options to lifecycle handlers", async () => {
    await assertVerificationRunOptionsReachHandlers();
  });
});
