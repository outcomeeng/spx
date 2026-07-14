import { readdir } from "node:fs/promises";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { RESULT_VALUE_KEY } from "@/config/types";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function configShape(): fc.Arbitrary<Config> {
  return fc.oneof(CONFIG_TEST_GENERATOR.emptyConfig(), CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
}

describe("resolveConfig — side-effect freedom (property)", () => {
  it("leaves the project directory unchanged across any config shape drawn from the registry", async () => {
    await fc.assert(
      fc.asyncProperty(configShape(), async (projectConfig) => {
        await withTestEnv(projectConfig, async ({ productDir }) => {
          const before = await readdir(productDir);
          await resolveConfig(productDir, [specTreeConfigDescriptor]);
          const after = await readdir(productDir);

          expect(after.sort(compareAsciiStrings)).toEqual(before.sort(compareAsciiStrings));
        });
      }),
      { numRuns: 10 },
    );
  });

  it("leaves the process environment unchanged across any config shape", async () => {
    await fc.assert(
      fc.asyncProperty(configShape(), CONFIG_TEST_GENERATOR.environmentSentinel(), async (projectConfig, sentinel) => {
        process.env[sentinel.key] = sentinel.value;
        try {
          await withTestEnv(projectConfig, async ({ productDir }) => {
            await resolveConfig(productDir, [specTreeConfigDescriptor]);
            expect(process.env[sentinel.key]).toBe(sentinel.value);
          });
        } finally {
          delete process.env[sentinel.key];
        }
      }),
      { numRuns: 10 },
    );
  });

  it("does not mutate process.cwd during resolution across any config shape", async () => {
    await fc.assert(
      fc.asyncProperty(configShape(), async (projectConfig) => {
        const before = process.cwd();
        await withTestEnv(projectConfig, async ({ productDir }) => {
          await resolveConfig(productDir, [specTreeConfigDescriptor]);
        });
        expect(process.cwd()).toBe(before);
      }),
      { numRuns: 10 },
    );
  });
});

describe("resolveConfig — typed-or-error invariant (C4)", () => {
  it("returns ok:true with a fully-typed Config or ok:false with a descriptor-qualified error — never a partial result", async () => {
    const rejectingConfig: Config = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig()).config;

    await withTestEnv(rejectingConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(RESULT_VALUE_KEY in result).toBe(false);
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });

  it("on success, the Config contains only descriptor sections — no raw config leakage", async () => {
    const unregisteredSection = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unregisteredField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unregisteredValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: { kinds: { enabler: KIND_REGISTRY.enabler } },
      [unregisteredSection]: { [unregisteredField]: unregisteredValue },
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value)).toEqual([specTreeConfigDescriptor.section]);
      }
    });
  });
});
