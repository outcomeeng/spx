import { describe, it } from "vitest";

import {
  assertDefaultMethodologyProbeReadsAgentHomesAtProbeTime,
  assertMethodologyDiagnoseIgnoresUnrelatedHarnessConfigDefects,
  assertMethodologyDiagnoseRejectsHarnessMethodologyConfig,
  assertMethodologyDiagnoseRejectsUnavailableChecksBeforeHarnessMethodologyConfig,
  assertMethodologyDiagnoseTextRenders,
  assertMethodologyManifestWithoutFactsRejects,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it("renders methodology-context text from the check record", async () => {
    await assertMethodologyDiagnoseTextRenders();
  });

  it("rejects methodology-context manifests without methodology facts", async () => {
    await assertMethodologyManifestWithoutFactsRejects();
  });

  it("rejects stale harness methodology config before probing", async () => {
    await assertMethodologyDiagnoseRejectsHarnessMethodologyConfig();
  });

  it("ignores unrelated harness config defects before probing", async () => {
    await assertMethodologyDiagnoseIgnoresUnrelatedHarnessConfigDefects();
  });

  it("rejects unavailable checks before stale harness methodology config", async () => {
    await assertMethodologyDiagnoseRejectsUnavailableChecksBeforeHarnessMethodologyConfig();
  });

  it("resolves default probe agent homes when probing", async () => {
    await assertDefaultMethodologyProbeReadsAgentHomesAtProbeTime();
  });
});
