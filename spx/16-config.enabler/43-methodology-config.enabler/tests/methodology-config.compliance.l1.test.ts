import { describe, expect, it } from "vitest";

import {
  DEFAULT_METHODOLOGY_CONFIG,
  DEFAULT_METHODOLOGY_SOURCE,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
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
  observeNonExactMethodologyVersionResolution,
  observeUndeclaredMethodologyVersionResolution,
} from "@testing/harnesses/config/methodology";

describe("methodology config compliance", () => {
  it("rejects malformed methodology config before consumers run", async () => {
    for (const observation of await observeMalformedMethodologyConfigRejections()) {
      expect(observation.result.ok).toBe(false);
      if (!observation.result.ok) expect(observation.result.error).toContain(observation.field);
    }
  });

  it("rejects a version that is not an exact methodology version, naming the field", async () => {
    const observation = await observeNonExactMethodologyVersionResolution();

    expect(observation.result.ok).toBe(false);
    if (!observation.result.ok) {
      expect(observation.result.error).toContain(`${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.VERSION}`);
    }
  });

  it("resolves an undeclared version to no version and the source to the methodology repository", async () => {
    const observation = await observeUndeclaredMethodologyVersionResolution();

    expect(observation.result.ok).toBe(true);
    if (!observation.result.ok) throw new Error(observation.result.error);
    expect(observation.result.value.version).toBeUndefined();
    expect(observation.result.value.migratingFrom).toBeUndefined();
    expect(observation.result.value.source).toBe(DEFAULT_METHODOLOGY_SOURCE);
  });

  it("carries a declared version as the exact methodology version", async () => {
    const observation = await observeDeclaredMethodologyVersionResolution();

    expect(observation.result.ok).toBe(true);
    if (!observation.result.ok) throw new Error(observation.result.error);
    expect(observation.result.value.version).toBe(observation.declared);
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
