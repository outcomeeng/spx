import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_CONFIG_FIELDS, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { specTreeAbsentSectionConfig, specTreeKindsFieldCases } from "@testing/generators/spec-tree/filename-grammar";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("spec-tree config descriptor", () => {
  it("resolves the full default kind list with their definitions when no specTree section is configured", async () => {
    await withTestEnv(specTreeAbsentSectionConfig(), async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[SPEC_TREE_CONFIG.SECTION]).toEqual({ [SPEC_TREE_CONFIG_FIELDS.KINDS]: KIND_REGISTRY });
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
