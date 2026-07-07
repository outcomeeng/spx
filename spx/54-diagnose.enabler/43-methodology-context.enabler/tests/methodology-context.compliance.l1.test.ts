import { describe, it } from "vitest";

import {
  assertMethodologyDiagnoseTextRenders,
  assertMethodologyManifestWithoutFactsRejects,
  assertMethodologyProbeIgnoresNonVersionDirectories,
  assertMethodologyProbePrefersConfiguredExactVersion,
  assertMethodologyProbeUsesNumericVersionOrder,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose compliance", () => {
  it("renders methodology-context text from the check record", async () => {
    await assertMethodologyDiagnoseTextRenders();
  });

  it("rejects methodology-context manifests without methodology facts", async () => {
    await assertMethodologyManifestWithoutFactsRejects();
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
});
