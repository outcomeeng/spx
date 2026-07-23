import { describe, expect, it } from "vitest";

import { resolveProductDir } from "@/domains/config/root";
import {
  CONFIG_TEST_GENERATOR,
  CONFIG_TEST_ORACLE,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";

describe("product directory API vocabulary", () => {
  it("resolveProductDir exposes productDir without legacy root aliases", async () => {
    const cwd = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const gitToplevel = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

    const result = resolveProductDir(cwd, { readGitToplevel: () => gitToplevel });

    expect(result).toEqual({ productDir: gitToplevel });
    for (const legacyField of CONFIG_TEST_ORACLE.legacyProductRootFieldNames) {
      expect(legacyField in result).toBe(false);
    }
  });

  it("resolveProductDir fallback exposes productDir without legacy root aliases", async () => {
    const cwd = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

    const result = resolveProductDir(cwd, { readGitToplevel: () => undefined });

    expect(result.productDir).toBe(cwd);
    expect(result.warning).toContain(cwd);
    for (const legacyField of CONFIG_TEST_ORACLE.legacyProductRootFieldNames) {
      expect(legacyField in result).toBe(false);
    }
  });
});
