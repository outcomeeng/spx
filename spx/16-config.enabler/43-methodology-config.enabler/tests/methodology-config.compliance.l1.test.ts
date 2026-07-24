import { describe, expect, it } from "vitest";

import {
  DEFAULT_METHODOLOGY_CONFIG,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  METHODOLOGY_VERSION_INTENT,
  methodologyVersionIntent,
  validateMethodologyConfig,
} from "@/config/methodology";
import {
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  HARNESS_ENVIRONMENT_SECTION,
  harnessEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import {
  INVALID_METHODOLOGY_SOURCES,
  INVALID_METHODOLOGY_VERSIONS,
  resolveHarnessEnvironmentWithMethodologySection,
  resolveMethodologySource,
  resolveMethodologyVersion,
  resolveMethodologyWithSimilarHarnessField,
  resolveMethodologyWithStrayHarnessFields,
} from "@testing/harnesses/config/methodology";

describe("methodology config compliance", () => {
  it.each(INVALID_METHODOLOGY_SOURCES)(
    "rejects the malformed methodology source %j before consumers run",
    async (source) => {
      const resolved = await resolveMethodologySource(source);

      expect(resolved.ok).toBe(false);
      if (resolved.ok) return;
      expect(resolved.error).toContain(`${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.SOURCE}`);
    },
  );

  it.each(INVALID_METHODOLOGY_VERSIONS)(
    "rejects the malformed methodology version %j before consumers run",
    async (version) => {
      const resolved = await resolveMethodologyVersion(version);

      expect(resolved.ok).toBe(false);
      if (resolved.ok) return;
      expect(resolved.error).toContain(`${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.VERSION}`);
    },
  );

  it("rejects methodology under harnessEnvironment", async () => {
    const resolved = await resolveHarnessEnvironmentWithMethodologySection();

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain(`${HARNESS_ENVIRONMENT_SECTION}.${METHODOLOGY_SECTION}`);
  });

  it("rejects methodology under harnessEnvironment among multiple unknown fields", async () => {
    const resolved = await resolveMethodologyWithStrayHarnessFields();

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain(METHODOLOGY_SECTION);
  });

  it("ignores similar harnessEnvironment fields when resolving methodology", async () => {
    const resolved = await resolveMethodologyWithSimilarHarnessField();

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value).toEqual(DEFAULT_METHODOLOGY_CONFIG);
  });

  it("keeps methodology defaults out of harnessEnvironment", () => {
    expect(harnessEnvironmentConfigDescriptor.defaults).not.toHaveProperty(METHODOLOGY_SECTION);
    expect(HARNESS_ENVIRONMENT_CONFIG_FIELDS).not.toHaveProperty("METHODOLOGY");
  });

  it("never represents the bootstrap sentinel as an exact methodology version", () => {
    const resolved = validateMethodologyConfig({});

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(methodologyVersionIntent(resolved.value.version)).toBe(METHODOLOGY_VERSION_INTENT.BOOTSTRAP);
    expect(methodologyVersionIntent(resolved.value.version)).not.toBe(METHODOLOGY_VERSION_INTENT.EXACT);
  });

  it("represents a declared version that is not the sentinel as exact methodology identity", () => {
    const sentinelResolved = validateMethodologyConfig({});
    expect(sentinelResolved.ok).toBe(true);
    if (!sentinelResolved.ok) return;

    const declared = `${sentinelResolved.value.version}-declared`;
    const resolved = validateMethodologyConfig({ version: declared });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(methodologyVersionIntent(resolved.value.version)).toBe(METHODOLOGY_VERSION_INTENT.EXACT);
  });
});
