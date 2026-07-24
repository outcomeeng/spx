import { describe, expect, it } from "vitest";

import { METHODOLOGY_VERSION_INTENT, methodologyVersionIntent, validateMethodologyConfig } from "@/config/methodology";
import {
  assertHarnessEnvironmentDefaultsExcludeMethodology,
  assertHarnessEnvironmentMethodologyRejects,
  assertMalformedMethodologyConfigRejects,
  assertMethodologyResolverIgnoresSimilarHarnessField,
  assertMethodologyResolverRejectsHarnessMethodologyAmongUnknownFields,
} from "@testing/harnesses/config/methodology";

describe("methodology config compliance", () => {
  it("rejects malformed methodology config before consumers run", async () => {
    await assertMalformedMethodologyConfigRejects();
  });

  it("rejects methodology under harnessEnvironment", async () => {
    await assertHarnessEnvironmentMethodologyRejects();
  });

  it("rejects methodology under harnessEnvironment among multiple unknown fields", async () => {
    await assertMethodologyResolverRejectsHarnessMethodologyAmongUnknownFields();
  });

  it("ignores similar harnessEnvironment fields when resolving methodology", async () => {
    await assertMethodologyResolverIgnoresSimilarHarnessField();
  });

  it("keeps methodology defaults out of harnessEnvironment", () => {
    assertHarnessEnvironmentDefaultsExcludeMethodology();
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
