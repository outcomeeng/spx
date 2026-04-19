import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";
import type { Config } from "@/spec/testing/index.js";

const KIND_SUBSETS: readonly Config[] = [
  {},
  { specTree: { kinds: {} } },
  { specTree: { kinds: { enabler: KIND_REGISTRY.enabler } } },
  { specTree: { kinds: { enabler: KIND_REGISTRY.enabler, adr: KIND_REGISTRY.adr } } },
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

describe("resolveConfig — determinism", () => {
  it("produces the same resolved Config on every load against any yaml shape drawn from the registry", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...KIND_SUBSETS), async (yamlConfig) => {
        await withTestEnv(yamlConfig, async ({ projectDir }) => {
          const first = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
          const second = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

          expect(first).toEqual(second);
        });
      }),
      { numRuns: 10 },
    );
  });

  it("is deterministic across distinct temp roots when the yaml content is identical", async () => {
    const yamlConfig: Config = {
      specTree: {
        kinds: {
          enabler: KIND_REGISTRY.enabler,
          adr: KIND_REGISTRY.adr,
        },
      },
    };

    let firstValue: unknown;
    let secondValue: unknown;

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(result.ok).toBe(true);
      if (result.ok) firstValue = result.value;
    });

    await withTestEnv(yamlConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(result.ok).toBe(true);
      if (result.ok) secondValue = result.value;
    });

    expect(firstValue).toEqual(secondValue);
  });
});
