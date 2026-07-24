import { describe, expect, it } from "vitest";

import { createMethodologyContextProbe } from "@/commands/diagnose/probes";
import { DEFAULT_METHODOLOGY_VERSION, METHODOLOGY_SECTION, METHODOLOGY_VERSION_INTENT } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { DIAGNOSE_RESOLVE_ERROR } from "@/domains/diagnose/resolve";
import {
  firstCheck,
  generatedMethodology,
  installMethodologyVersion,
  METHODOLOGY_CACHE_VERSION,
  observedMethodology,
  probeConstructedBeforeAgentHomeEnv,
  probeOverAgentHomes,
  runDiagnoseWithLegacyMethodologySection,
  runDiagnoseWithUnavailableCheck,
  runDiagnoseWithUnrelatedLegacyDefect,
  runMethodologyDiagnoseJson,
  runMethodologyDiagnoseText,
  runMethodologyManifestWithoutFacts,
  unavailableCheckName,
  withAgentHome,
  withAgentHomePair,
  withProductDir,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it.each([false, true])(
    "never converts an observed installed version into exact methodology identity (tracked tree: %s)",
    async (trackedSpecTree) => {
      const methodology = generatedMethodology();
      const observation = observedMethodology(methodology, trackedSpecTree);

      const report = await runMethodologyDiagnoseJson(methodology, observation);
      const check = firstCheck(report);

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
    const methodology = generatedMethodology();
    const observation = observedMethodology(methodology, false);

    const output = await runMethodologyDiagnoseText(methodology, observation);

    expect(output).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED);
    expect(output).toContain(methodology.source);
    expect(output).toContain(observation.version);
  });

  it("rejects methodology-context manifests without methodology facts", async () => {
    const error = await runMethodologyManifestWithoutFacts();

    expect(error).toContain(CHECK_NAME.METHODOLOGY_CONTEXT);
    expect(error).toContain(METHODOLOGY_SECTION);
  });

  it("rejects stale harness methodology config before probing", async () => {
    const error = await runDiagnoseWithLegacyMethodologySection();

    expect(error).toContain(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
  });

  it("ignores unrelated harness config defects before probing", async () => {
    const methodology = generatedMethodology();
    const observation = observedMethodology(methodology, false);

    const report = await runDiagnoseWithUnrelatedLegacyDefect(methodology, observation);

    expect(firstCheck(report).verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  });

  it("rejects unavailable checks before stale harness methodology config", async () => {
    const unavailableCheck = unavailableCheckName();

    const error = await runDiagnoseWithUnavailableCheck(unavailableCheck);

    expect(error).toContain(DIAGNOSE_RESOLVE_ERROR.UNAVAILABLE_CONFIGURED_CHECKS);
    expect(error).toContain(unavailableCheck);
    expect(error).not.toContain(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
  });

  it("orders observed methodology versions numerically", async () => {
    const methodology = generatedMethodology();

    await withAgentHome(async (codexHome) => {
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_2);
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);

      const observed = await probeOverAgentHomes(methodology, codexHome);

      expect(observed.version).toBe(METHODOLOGY_CACHE_VERSION.PATCH_10);
    });
  });

  it("ignores non-version cache directories when resolving installed methodology", async () => {
    const methodology = generatedMethodology();

    await withAgentHome(async (codexHome) => {
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.UNORDERED);

      const observed = await probeOverAgentHomes(methodology, codexHome);

      expect(observed.version).toBe(METHODOLOGY_CACHE_VERSION.PATCH_10);
    });
  });

  it("prefers the configured exact methodology version when installed", async () => {
    const methodology = generatedMethodology(METHODOLOGY_CACHE_VERSION.PATCH_1);

    await withAgentHome(async (codexHome) => {
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_1);
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);

      const observed = await probeOverAgentHomes(methodology, codexHome);

      expect(observed.version).toBe(methodology.version);
    });
  });

  it("reports an installed methodology version when a configured exact version is missing", async () => {
    const methodology = generatedMethodology(METHODOLOGY_CACHE_VERSION.PATCH_1);

    await withAgentHome(async (codexHome) => {
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);

      const observed = await probeOverAgentHomes(methodology, codexHome);

      expect(observed.version).toBe(METHODOLOGY_CACHE_VERSION.PATCH_10);
    });
  });

  it("accepts configured exact methodology versions with non-version directory names", async () => {
    const methodology = generatedMethodology(METHODOLOGY_CACHE_VERSION.EXACT_ONLY);

    await withAgentHome(async (codexHome) => {
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.EXACT_ONLY);
      await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);

      const observed = await probeOverAgentHomes(methodology, codexHome);

      expect(observed.version).toBe(METHODOLOGY_CACHE_VERSION.EXACT_ONLY);
    });
  });

  it("reads supported local agent methodology caches", async () => {
    const methodology = generatedMethodology();

    await withAgentHomePair(async (codexHome, claudeHome) => {
      await installMethodologyVersion(claudeHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);

      const observed = await probeOverAgentHomes(methodology, codexHome, claudeHome);

      expect(observed.version).toBe(METHODOLOGY_CACHE_VERSION.PATCH_10);
    });
  });

  it("resolves agent homes at probe time rather than at construction", async () => {
    const methodology = generatedMethodology();

    await withProductDir(false, async (productDir) => {
      await withAgentHomePair(async (codexHome, claudeHome) => {
        await installMethodologyVersion(codexHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);

        const observed = await probeConstructedBeforeAgentHomeEnv(
          methodology,
          productDir,
          codexHome,
          claudeHome,
        );

        expect(observed.version).toBe(METHODOLOGY_CACHE_VERSION.PATCH_10);
      });
    });
  });
});
