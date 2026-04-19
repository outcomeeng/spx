import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import type { ConfigDescriptor, Result } from "@/config/types.js";
import { specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

type FakeSectionConfig = { readonly mode: "strict" | "lenient" };

const fakeDescriptor: ConfigDescriptor<FakeSectionConfig> = {
  section: "fakeDomain",
  defaults: { mode: "lenient" },
  validate(value: unknown): Result<FakeSectionConfig> {
    if (typeof value !== "object" || value === null) {
      return { ok: false, error: "fakeDomain section must be an object" };
    }
    const candidate = value as { mode?: unknown };
    if (candidate.mode !== "strict" && candidate.mode !== "lenient") {
      return { ok: false, error: "fakeDomain.mode must be 'strict' or 'lenient'" };
    }
    return { ok: true, value: { mode: candidate.mode } };
  },
};

describe("resolveConfig — registry extension", () => {
  it("exposes a newly registered descriptor's section alongside existing ones, with no change to other descriptors", async () => {
    const yamlConfig: Config = {};

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor, fakeDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value["specTree"]).toEqual(specTreeConfigDescriptor.defaults);
        expect(result.value["fakeDomain"]).toEqual(fakeDescriptor.defaults);
      }
    });
  });

  it("merges yaml content for the new descriptor without touching other descriptors' sections", async () => {
    const yamlConfig: Config = {
      fakeDomain: { mode: "strict" },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor, fakeDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value["fakeDomain"]).toEqual({ mode: "strict" });
        expect(result.value["specTree"]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("propagates validator errors for a newly added descriptor with descriptor-qualified context", async () => {
    const yamlConfig: Config = {
      fakeDomain: { mode: "banana" },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor, fakeDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/fakeDomain/);
      }
    });
  });
});
