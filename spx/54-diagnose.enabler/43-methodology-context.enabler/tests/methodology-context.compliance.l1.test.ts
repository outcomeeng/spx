import { describe, it } from "vitest";

import {
  assertMethodologyDiagnoseTextRenders,
  assertMethodologyProbeUsesNumericVersionOrder,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it("renders methodology-context text from the check record", async () => {
    await assertMethodologyDiagnoseTextRenders();
  });

  it("orders observed methodology versions numerically", async () => {
    await assertMethodologyProbeUsesNumericVersionOrder();
  });
});
