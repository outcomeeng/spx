import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

describe("resolveConfig — partial yaml", () => {
  it("merges the subset declared in yaml with descriptor defaults for that section", async () => {
    const yamlConfig: Config = {
      specTree: {
        kinds: {
          enabler: KIND_REGISTRY.enabler,
          adr: KIND_REGISTRY.adr,
        },
      },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value["specTree"] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort()).toEqual(["adr", "enabler"]);
      }
    });
  });

  it("fills sections absent from yaml with the descriptor's defaults, leaving declared sections intact", async () => {
    const yamlConfig: Config = {};

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value["specTree"]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("passes the yaml section value — not the full yaml — through the descriptor's validator", async () => {
    const yamlConfig: Config = {
      specTree: { kinds: { pdr: KIND_REGISTRY.pdr } },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value["specTree"] as typeof specTreeConfigDescriptor.defaults;
        expect(specTree.kinds).toEqual({ pdr: KIND_REGISTRY.pdr });
      }
    });
  });
});
