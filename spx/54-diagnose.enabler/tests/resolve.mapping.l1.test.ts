import { describe, expect, it } from "vitest";

import { DEFAULT_METHODOLOGY_SOURCE, DEFAULT_METHODOLOGY_VERSION } from "@/config/methodology";
import { DEFAULT_HARNESS_ENVIRONMENT_CONFIG } from "@/domains/agent-environment/config";
import type { DiagnoseConfig } from "@/domains/diagnose/config";
import { CHECK_NAME, type DiagnoseManifest } from "@/domains/diagnose/manifest";
import { resolveDiagnoseFacts } from "@/domains/diagnose/resolve";
import { arbitraryNameToken, arbitrarySpxFloor } from "@testing/generators/diagnose/manifest";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("diagnostic fact resolution precedence", () => {
  it("keeps manifest facts authoritative while anchoring product facts to the checkout", () => {
    assertProperty(
      arbitrarySpxFloor(),
      (manifestFloor) => {
        const manifest: DiagnoseManifest = {
          checks: [CHECK_NAME.SPX_REACHABILITY],
          spxFloor: manifestFloor,
        };
        const config: DiagnoseConfig = {
          spxFloor: `${manifestFloor}-config`,
          checks: [CHECK_NAME.SESSION_STORE],
        };
        const result = resolveDiagnoseFacts({
          manifest,
          config,
          harnessEnvironment: DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
          availableChecks: Object.values(CHECK_NAME),
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual({
            ...manifest,
            harnessEnvironment: DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
          });
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("resolves caller facts from config when no manifest is supplied", () => {
    assertProperty(
      arbitrarySpxFloor(),
      (spxFloor) => {
        const config: DiagnoseConfig = {
          spxFloor,
          checks: [CHECK_NAME.SPX_REACHABILITY],
        };
        const result = resolveDiagnoseFacts({
          config,
          methodology: {
            source: DEFAULT_METHODOLOGY_SOURCE,
            version: DEFAULT_METHODOLOGY_VERSION,
          },
          harnessEnvironment: DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
          availableChecks: Object.values(CHECK_NAME),
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.checks).toEqual(config.checks);
          expect(result.value.spxFloor).toBe(spxFloor);
          expect(result.value.methodology).toEqual({
            source: DEFAULT_METHODOLOGY_SOURCE,
            version: DEFAULT_METHODOLOGY_VERSION,
          });
          expect(result.value.harnessEnvironment).toBe(DEFAULT_HARNESS_ENVIRONMENT_CONFIG);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("defaults to every available check when config names none", () => {
    const result = resolveDiagnoseFacts({
      config: {},
      harnessEnvironment: DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
      availableChecks: Object.values(CHECK_NAME),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.checks).toEqual(Object.values(CHECK_NAME));
      expect(result.value.spxFloor).toBeUndefined();
    }
  });

  it("rejects a configured check absent from the current build", () => {
    assertProperty(
      arbitraryNameToken().filter((name) => Object.values(CHECK_NAME).every((check) => check !== name)),
      (unknownCheck) => {
        const result = resolveDiagnoseFacts({
          config: { checks: [unknownCheck] },
          harnessEnvironment: DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
          availableChecks: Object.values(CHECK_NAME),
        });

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain(unknownCheck);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
