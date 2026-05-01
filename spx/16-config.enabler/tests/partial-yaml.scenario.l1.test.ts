import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config";
import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

describe("resolveConfig — partial config", () => {
  it("merges the subset declared in config content with descriptor defaults for that section", async () => {
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: {
        kinds: {
          enabler: KIND_REGISTRY.enabler,
          adr: KIND_REGISTRY.adr,
        },
      },
    };

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const declaredSpecTree =
          projectConfig[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort()).toEqual(Object.keys(declaredSpecTree.kinds).sort());
      }
    });
  });

  it("fills sections absent from config content with the descriptor's defaults, leaving declared sections intact", async () => {
    const projectConfig: Config = {};

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("passes the parsed section value — not the full config — through the descriptor's validator", async () => {
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: { kinds: { pdr: KIND_REGISTRY.pdr } },
    };

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(specTree.kinds).toEqual({ pdr: KIND_REGISTRY.pdr });
      }
    });
  });
});
