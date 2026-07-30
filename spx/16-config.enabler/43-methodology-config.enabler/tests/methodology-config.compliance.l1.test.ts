import { describe, expect, it } from "vitest";

import {
  DEFAULT_METHODOLOGY_CONFIG,
  DEFAULT_METHODOLOGY_VERSION,
  METHODOLOGY_SECTION,
  METHODOLOGY_VERSION_INTENT,
  methodologyVersionIntent,
} from "@/config/methodology";
import {
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  HARNESS_ENVIRONMENT_SECTION,
  harnessEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import {
  observeDeclaredMethodologyVersionResolution,
  observeHarnessEnvironmentMethodologyRejection,
  observeMalformedMethodologyConfigRejections,
  observeMethodologyResolverHarnessUnknownFieldRejection,
  observeMethodologyResolverSimilarHarnessField,
  observeUndeclaredMethodologyVersionResolution,
} from "@testing/harnesses/config/methodology";

describe("methodology config compliance", () => {
  it("rejects malformed methodology config before consumers run", async () => {
    for (const observation of await observeMalformedMethodologyConfigRejections()) {
      expect(observation.result.ok).toBe(false);
      if (!observation.result.ok) expect(observation.result.error).toContain(observation.field);
    }
  });

  it("preserves the sentinel version as bootstrap intent rather than an exact version", async () => {
    const observation = await observeUndeclaredMethodologyVersionResolution();

    expect(observation.result.ok).toBe(true);
    if (!observation.result.ok) throw new Error(observation.result.error);
    expect(observation.result.value.version).toBe(DEFAULT_METHODOLOGY_VERSION);
    expect(methodologyVersionIntent(observation.result.value.version)).toBe(METHODOLOGY_VERSION_INTENT.BOOTSTRAP);
  });

  it("carries a declared non-sentinel version as an exact methodology version", async () => {
    const observation = await observeDeclaredMethodologyVersionResolution();

    expect(observation.result.ok).toBe(true);
    if (!observation.result.ok) throw new Error(observation.result.error);
    expect(observation.result.value.version).toBe(observation.declared);
    expect(methodologyVersionIntent(observation.result.value.version)).toBe(METHODOLOGY_VERSION_INTENT.EXACT);
  });

  it("rejects methodology under harnessEnvironment", async () => {
    const result = await observeHarnessEnvironmentMethodologyRejection();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`${HARNESS_ENVIRONMENT_SECTION}.${METHODOLOGY_SECTION}`);
  });

  it("rejects methodology under harnessEnvironment among multiple unknown fields", async () => {
    const result = await observeMethodologyResolverHarnessUnknownFieldRejection();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(METHODOLOGY_SECTION);
  });

  it("ignores similar harnessEnvironment fields when resolving methodology", async () => {
    const result = await observeMethodologyResolverSimilarHarnessField();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual(DEFAULT_METHODOLOGY_CONFIG);
  });

  it("keeps methodology defaults out of harnessEnvironment", () => {
    expect(harnessEnvironmentConfigDescriptor.defaults).not.toHaveProperty(METHODOLOGY_SECTION);
    expect(HARNESS_ENVIRONMENT_CONFIG_FIELDS).not.toHaveProperty("METHODOLOGY");
  });
});
