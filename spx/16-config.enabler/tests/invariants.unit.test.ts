import { readdir } from "node:fs/promises";

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

const ENV_SENTINEL_KEY = "SPX_CONFIG_INVARIANT_PROBE";
const ENV_SENTINEL_VALUE = "set-before-resolve";

const YAML_SHAPES: readonly Config[] = [
  {},
  { specTree: { kinds: {} } },
  { specTree: { kinds: { enabler: KIND_REGISTRY.enabler } } },
  { specTree: { kinds: { adr: KIND_REGISTRY.adr, pdr: KIND_REGISTRY.pdr } } },
  {
    specTree: {
      kinds: {
        enabler: KIND_REGISTRY.enabler,
        outcome: KIND_REGISTRY.outcome,
        adr: KIND_REGISTRY.adr,
        pdr: KIND_REGISTRY.pdr,
      },
    },
  },
];

describe("resolveConfig — side-effect freedom (property)", () => {
  it("leaves the project directory unchanged across any yaml shape drawn from the registry", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...YAML_SHAPES), async (yamlConfig) => {
        await withTestEnv(yamlConfig, async ({ projectDir }) => {
          const before = await readdir(projectDir);
          await resolveConfig(projectDir, [specTreeConfigDescriptor]);
          const after = await readdir(projectDir);

          expect(after.sort()).toEqual(before.sort());
        });
      }),
      { numRuns: 10 },
    );
  });

  it("leaves the process environment unchanged across any yaml shape", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...YAML_SHAPES), async (yamlConfig) => {
        process.env[ENV_SENTINEL_KEY] = ENV_SENTINEL_VALUE;
        try {
          await withTestEnv(yamlConfig, async ({ projectDir }) => {
            await resolveConfig(projectDir, [specTreeConfigDescriptor]);
            expect(process.env[ENV_SENTINEL_KEY]).toBe(ENV_SENTINEL_VALUE);
          });
        } finally {
          delete process.env[ENV_SENTINEL_KEY];
        }
      }),
      { numRuns: 10 },
    );
  });

  it("does not mutate process.cwd during resolution across any yaml shape", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...YAML_SHAPES), async (yamlConfig) => {
        const before = process.cwd();
        await withTestEnv(yamlConfig, async ({ projectDir }) => {
          await resolveConfig(projectDir, [specTreeConfigDescriptor]);
        });
        expect(process.cwd()).toBe(before);
      }),
      { numRuns: 10 },
    );
  });
});

describe("resolveConfig — typed-or-error invariant (C4)", () => {
  it("returns ok:true with a fully-typed Config or ok:false with a descriptor-qualified error — never a partial result", async () => {
    const rejectingConfig: Config = {
      specTree: { kinds: { wrong: { category: "node", suffix: ".wrong" } } },
    };

    await withTestEnv(rejectingConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect("value" in result).toBe(false);
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });

  it("on success, the Config contains only descriptor sections — no raw yaml leakage", async () => {
    const yamlConfig: Config = {
      specTree: { kinds: { enabler: KIND_REGISTRY.enabler } },
      unregisteredSection: { hello: "world" },
    };

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value)).toEqual([specTreeConfigDescriptor.section]);
      }
    });
  });
});
