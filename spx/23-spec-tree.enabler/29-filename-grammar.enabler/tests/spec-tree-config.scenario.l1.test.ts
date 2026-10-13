import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config";
import { SPEC_TREE_CONFIG, SPEC_TREE_CONFIG_FIELDS, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { specTreeAbsentSectionConfig, specTreeKindsFieldCases } from "@testing/generators/spec-tree/filename-grammar";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("spec-tree config descriptor", () => {
  it("resolves a spec-tree section with no kinds field when no yaml configures a specTree section", async () => {
    await withTestEnv(specTreeAbsentSectionConfig(), async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[SPEC_TREE_CONFIG.SECTION]).not.toHaveProperty(SPEC_TREE_CONFIG_FIELDS.KINDS);
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
