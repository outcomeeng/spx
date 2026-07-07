import { describe, it } from "vitest";

import {
  assertMethodologyDiagnoseIgnoresUnrelatedHarnessConfigDefects,
  assertMethodologyDiagnoseRejectsHarnessMethodologyConfig,
  assertMethodologyDiagnoseTextRenders,
  assertMethodologyManifestWithoutFactsRejects,
  assertMethodologyProbeIgnoresNonVersionDirectories,
  assertMethodologyProbePrefersConfiguredExactVersion,
  assertMethodologyProbeReadsSupportedAgentCaches,
  assertMethodologyProbeReportsInstalledVersionForMissingExactVersion,
  assertMethodologyProbeUsesExactNonVersionDirectory,
  assertMethodologyProbeUsesNumericVersionOrder,
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

  it("orders observed methodology versions numerically", async () => {
    await assertMethodologyProbeUsesNumericVersionOrder();
  });

  it("ignores non-version cache directories when resolving installed methodology", async () => {
    await assertMethodologyProbeIgnoresNonVersionDirectories();
  });

  it("prefers the configured exact methodology version when installed", async () => {
    await assertMethodologyProbePrefersConfiguredExactVersion();
  });

  it("reports an installed methodology version when a configured exact version is missing", async () => {
    await assertMethodologyProbeReportsInstalledVersionForMissingExactVersion();
  });

  it("accepts configured exact methodology versions with non-version directory names", async () => {
    await assertMethodologyProbeUsesExactNonVersionDirectory();
  });

  it("reads supported local agent methodology caches", async () => {
    await assertMethodologyProbeReadsSupportedAgentCaches();
  });
});
