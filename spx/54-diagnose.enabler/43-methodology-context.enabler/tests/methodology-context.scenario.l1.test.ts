import { describe, it } from "vitest";

import {
  assertExactMethodologyVersionMismatchDiagnose,
  assertInstalledMethodologyDiagnoseIsHealthy,
  assertManifestMethodologyDiagnoseIsHealthy,
  assertMethodologyProbePreservesMixedCacheReadErrors,
  assertMethodologyProbeReadErrorsReachUnknownDiagnose,
  assertMethodologyRunnerHandlesMissingMethodologyFact,
  assertUnavailableMethodologyDiagnose,
  assertUnknownMethodologyDiagnose,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose scenarios", () => {
  it("reports installed methodology config with an observed version", async () => {
    await assertInstalledMethodologyDiagnoseIsHealthy();
  });

  it("reports manifest methodology facts with an observed version", async () => {
    await assertManifestMethodologyDiagnoseIsHealthy();
  });

  it("reports exact methodology version mismatch", async () => {
    await assertExactMethodologyVersionMismatchDiagnose();
  });

  it("reports unavailable methodology context", async () => {
    await assertUnavailableMethodologyDiagnose();
  });

  it("reports unknown methodology context", async () => {
    await assertUnknownMethodologyDiagnose();
  });

  it("reports missing methodology facts as unknown", async () => {
    await assertMethodologyRunnerHandlesMissingMethodologyFact();
  });

  it("reports methodology probe read errors as unknown", async () => {
    await assertMethodologyProbeReadErrorsReachUnknownDiagnose();
  });

  it("reports mixed methodology cache read errors as unknown", async () => {
    await assertMethodologyProbePreservesMixedCacheReadErrors();
  });
});
