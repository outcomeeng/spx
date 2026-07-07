import { describe, it } from "vitest";

import {
  assertExactMethodologyVersionMismatchDiagnose,
  assertInstalledMethodologyDiagnoseIsHealthy,
  assertUnavailableMethodologyDiagnose,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose scenarios", () => {
  it("reports installed methodology config with an observed version", async () => {
    await assertInstalledMethodologyDiagnoseIsHealthy();
  });

  it("reports exact methodology version mismatch", async () => {
    await assertExactMethodologyVersionMismatchDiagnose();
  });

  it("reports unavailable methodology context", async () => {
    await assertUnavailableMethodologyDiagnose();
  });
});
