import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@/config/testing";
import { specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function configShape(): fc.Arbitrary<Config> {
  return fc.oneof(CONFIG_TEST_GENERATOR.emptyConfig(), CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
}

describe("resolveConfig — determinism", () => {
  it("produces the same resolved Config on every load against any config shape drawn from the registry", async () => {
    await fc.assert(
      fc.asyncProperty(configShape(), async (projectConfig) => {
        await withTestEnv(projectConfig, async ({ projectDir }) => {
          const first = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
          const second = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

          expect(first).toEqual(second);
        });
      }),
      { numRuns: 10 },
    );
  });

  it("is deterministic across distinct temp roots when the config content is identical", async () => {
    const projectConfig = sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());

    let firstValue: unknown;
    let secondValue: unknown;

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(result.ok).toBe(true);
      if (result.ok) firstValue = result.value;
    });

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(result.ok).toBe(true);
      if (result.ok) secondValue = result.value;
    });

    expect(firstValue).toEqual(secondValue);
  });
});
