import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME, resolveConfig } from "@/config/index";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config";
import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

const EMPTY_CONFIG: Config = {};

describe("resolveConfig — no project config file", () => {
  it("resolves every registered descriptor to its declared defaults when the file is absent", async () => {
    await withTestEnv(EMPTY_CONFIG, async ({ projectDir }) => {
      await rm(join(projectDir, DEFAULT_CONFIG_FILENAME));

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("returns a Config containing every descriptor's section keyed by its section name", async () => {
    await withTestEnv(EMPTY_CONFIG, async ({ projectDir }) => {
      await rm(join(projectDir, DEFAULT_CONFIG_FILENAME));

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value)).toContain(specTreeConfigDescriptor.section);
      }
    });
  });

  it("treats an empty project config file the same as an absent file — defaults apply uniformly", async () => {
    await withTestEnv(EMPTY_CONFIG, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort()).toEqual(Object.keys(KIND_REGISTRY).sort());
      }
    });
  });
});
