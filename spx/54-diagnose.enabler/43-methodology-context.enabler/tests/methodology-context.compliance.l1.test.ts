import { describe, expect, it } from "vitest";

import { createMethodologyContextProbe } from "@/commands/diagnose/probes";
import { DEFAULT_METHODOLOGY_VERSION, METHODOLOGY_VERSION_INTENT } from "@/config/methodology";
import {
  assertDefaultMethodologyProbeReadsAgentHomesAtProbeTime,
  assertMethodologyDiagnoseIgnoresUnrelatedHarnessConfigDefects,
  assertMethodologyDiagnoseRejectsHarnessMethodologyConfig,
  assertMethodologyDiagnoseRejectsUnavailableChecksBeforeHarnessMethodologyConfig,
  assertMethodologyDiagnoseTextRenders,
  assertMethodologyManifestWithoutFactsRejects,
  assertMethodologyProbeIgnoresNonVersionDirectories,
  assertMethodologyProbePrefersConfiguredExactVersion,
  assertMethodologyProbeReadsSupportedAgentCaches,
  assertMethodologyProbeReportsInstalledVersionForMissingExactVersion,
  assertMethodologyProbeUsesExactNonVersionDirectory,
  assertMethodologyProbeUsesNumericVersionOrder,
  generatedMethodology,
  observedMethodology,
  runMethodologyDiagnoseJson,
  withProductDir,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it.each([false, true])(
    "never converts an observed installed version into exact methodology identity (tracked tree: %s)",
    async (trackedSpecTree) => {
      const methodology = generatedMethodology();
      const observation = observedMethodology(methodology, trackedSpecTree);

      const report = await runMethodologyDiagnoseJson(methodology, observation);
      const [check] = report.checks as readonly Record<string, unknown>[];

      expect(observation.version).not.toBe(DEFAULT_METHODOLOGY_VERSION);
      expect(check.readings).toEqual(expect.objectContaining({
        configuredVersion: DEFAULT_METHODOLOGY_VERSION,
        observedVersion: observation.version,
        versionIntent: METHODOLOGY_VERSION_INTENT.BOOTSTRAP,
      }));
    },
  );

  it.each([false, true])(
    "observes tracked spec-tree presence through the probe (present: %s)",
    async (trackedSpecTree) => {
      const methodology = generatedMethodology();

      await withProductDir(trackedSpecTree, async (productDir) => {
        const observed = await createMethodologyContextProbe(productDir).probe(methodology);

        expect(observed.trackedSpecTree).toBe(trackedSpecTree);
      });
    },
  );

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

  it("resolves default probe agent homes when probing", async () => {
    await assertDefaultMethodologyProbeReadsAgentHomesAtProbeTime();
  });
});
