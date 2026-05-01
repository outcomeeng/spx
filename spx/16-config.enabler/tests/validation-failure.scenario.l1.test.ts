import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { SPEC_TREE_KIND_CATEGORY, specTreeConfigDescriptor } from "@/spec/config";
import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

describe("resolveConfig — validator rejection", () => {
  it("returns an error naming the descriptor whose validator rejected its section", async () => {
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: {
        kinds: {
          madeUpKind: { category: SPEC_TREE_KIND_CATEGORY.NODE, suffix: ".fake" },
        },
      },
    };

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(specTreeConfigDescriptor.section);
      }
    });
  });

  it("names the offending field within the rejected section", async () => {
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: {
        kinds: {
          phantomKind: { category: SPEC_TREE_KIND_CATEGORY.NODE, suffix: ".phantom" },
        },
      },
    };

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/phantomKind/);
      }
    });
  });

  it("returns no partially usable Config when any descriptor rejects — either ok:true with full Config or ok:false with error", async () => {
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: {
        kinds: { nonsense: { category: SPEC_TREE_KIND_CATEGORY.NODE, suffix: ".nonsense" } },
      },
    };

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      if (result.ok) {
        throw new Error("expected validator rejection, got ok:true");
      }
      expect("value" in result).toBe(false);
    });
  });
});
