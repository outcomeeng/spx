import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import { specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

describe("resolveConfig — validator rejection", () => {
  it("returns an error naming the descriptor whose validator rejected its section", async () => {
    const yamlConfig: Config = {
      specTree: {
        kinds: {
          madeUpKind: { category: "node", suffix: ".fake" },
        },
      },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/specTree/);
      }
    });
  });

  it("names the offending field within the rejected section", async () => {
    const yamlConfig: Config = {
      specTree: {
        kinds: {
          phantomKind: { category: "node", suffix: ".phantom" },
        },
      },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/phantomKind/);
      }
    });
  });

  it("returns no partially usable Config when any descriptor rejects — either ok:true with full Config or ok:false with error", async () => {
    const yamlConfig: Config = {
      specTree: {
        kinds: { nonsense: { category: "node", suffix: ".nonsense" } },
      },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      if (result.ok) {
        throw new Error("expected validator rejection, got ok:true");
      }
      expect("value" in result).toBe(false);
    });
  });
});
