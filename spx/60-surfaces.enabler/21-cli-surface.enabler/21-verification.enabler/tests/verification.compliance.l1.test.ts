import { describe, it } from "vitest";

import { assertVerificationRunPathsHideJournalMechanics } from "@testing/harnesses/verify/harness";

describe("verification command family compliance", () => {
  it("keeps journal mechanics out of the public verification command paths and exposes no top-level verify verb", () => {
    assertVerificationRunPathsHideJournalMechanics();
  });
});
