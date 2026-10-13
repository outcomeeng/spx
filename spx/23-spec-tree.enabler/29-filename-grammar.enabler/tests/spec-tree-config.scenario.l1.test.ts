import { describe, expect, it } from "vitest";

import { resolveValidatedKindRegistry } from "@/commands/spec/context-input";
import { resolveConfig } from "@/config";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_CONFIG_FIELDS, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { specTreeAbsentSectionConfig, specTreeKindsFieldCases } from "@testing/generators/spec-tree/filename-grammar";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("spec-tree config descriptor", () => {
  it("resolves a spec-tree section with no kinds field, and kind vocabulary resolves only through KIND_REGISTRY, when no specTree section is configured", async () => {
    await withTestEnv(specTreeAbsentSectionConfig(), async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[SPEC_TREE_CONFIG.SECTION]).not.toHaveProperty(SPEC_TREE_CONFIG_FIELDS.KINDS);
      }

      const registry = await resolveValidatedKindRegistry(productDir);
      expect(registry.ok).toBe(true);
      if (registry.ok) {
        expect(registry.value).toBe(KIND_REGISTRY);
      }
    });
  });

  it.each(specTreeKindsFieldCases())("fails resolution: $title", async (testCase) => {
    await withTestEnv(testCase.config, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`${SPEC_TREE_CONFIG.SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS}`);
      }
    });
  });
});
