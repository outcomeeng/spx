import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

const EMPTY_CONFIG: Config = {};

describe("resolveConfig — no spx.config.yaml", () => {
  it("resolves every registered descriptor to its declared defaults when the file is absent", async () => {
    await withTestEnv(EMPTY_CONFIG, async ({ projectDir }) => {
      await rm(join(projectDir, "spx.config.yaml"));

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value["specTree"]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("returns a Config containing every descriptor's section keyed by its section name", async () => {
    await withTestEnv(EMPTY_CONFIG, async ({ projectDir }) => {
      await rm(join(projectDir, "spx.config.yaml"));

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value)).toContain(specTreeConfigDescriptor.section);
      }
    });
  });

  it("treats an empty yaml section set the same as an absent file — defaults apply uniformly", async () => {
    await withTestEnv(EMPTY_CONFIG, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value["specTree"] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort()).toEqual(Object.keys(KIND_REGISTRY).sort());
      }
    });
  });
});
