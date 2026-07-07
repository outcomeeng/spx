import { describe, it } from "vitest";

import {
  assertMethodologyDiagnoseTextRenders,
  assertMethodologyNotApplicableTextRenders,
  assertMethodologyProbeUsesNumericVersionOrder,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it("renders methodology-context text from the check record", async () => {
    await assertMethodologyDiagnoseTextRenders();
  });

  it("renders not-applicable methodology-context text from the check record", async () => {
    await assertMethodologyNotApplicableTextRenders();
  });

  it("orders observed methodology versions numerically", async () => {
    await assertMethodologyProbeUsesNumericVersionOrder();
  });
});
