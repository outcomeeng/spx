import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import type { ConfigDescriptor, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import {
  CONFIG_TEST_FIELDS,
  CONFIG_TEST_GENERATOR,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

type SpyDescriptorConfig = { readonly [CONFIG_TEST_FIELDS.TOKEN]: string };

function spyDescriptor(label: string): {
  readonly descriptor: ConfigDescriptor<SpyDescriptorConfig>;
  readonly seen: unknown[];
} {
  const seen: unknown[] = [];
  const descriptor: ConfigDescriptor<SpyDescriptorConfig> = {
    section: label,
    defaults: { [CONFIG_TEST_FIELDS.TOKEN]: label },
    validate(value: unknown): Result<SpyDescriptorConfig> {
      seen.push(value);
      if (Object(value) !== value || value === null) {
        return { ok: false, error: label };
      }
      const candidate = value as { [CONFIG_TEST_FIELDS.TOKEN]?: unknown };
      const token = candidate[CONFIG_TEST_FIELDS.TOKEN];
      if (token !== undefined && typeof token !== typeof label) {
        return { ok: false, error: label };
      }
      const resolvedToken = token === undefined ? label : String(token);
      return {
        ok: true,
        value: {
          [CONFIG_TEST_FIELDS.TOKEN]: resolvedToken,
        },
      };
    },
  };
  return { descriptor, seen };
}

export function registerConfigValidationIsolationCompliance(): void {
  describe("resolveConfig — per-descriptor validation isolation (C2)", () => {
    it("each validator receives only its own parsed section — not the raw config, not another descriptor's value", async () => {
      const [generatedA, generatedB] = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.tokenDescriptorPair(),
      );
      const probeA = spyDescriptor(generatedA.section);
      const probeB = spyDescriptor(generatedB.section);
      const tokenA = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const tokenB = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());

      const projectConfig: Config = {
        [probeA.descriptor.section]: { [CONFIG_TEST_FIELDS.TOKEN]: tokenA },
        [probeB.descriptor.section]: { [CONFIG_TEST_FIELDS.TOKEN]: tokenB },
      };

      await withTestEnv(projectConfig, async ({ productDir }) => {
        await resolveConfig(productDir, [probeA.descriptor, probeB.descriptor]);

        expect(probeA.seen).toEqual([{ [CONFIG_TEST_FIELDS.TOKEN]: tokenA }]);
        expect(probeB.seen).toEqual([{ [CONFIG_TEST_FIELDS.TOKEN]: tokenB }]);
      });
    });

    it("validators do not observe sections belonging to other descriptors", async () => {
      const probe = spyDescriptor(
        sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      );
      const token = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
      const projectConfig: Config = {
        ...sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig()),
        [probe.descriptor.section]: { [CONFIG_TEST_FIELDS.TOKEN]: token },
      };

      await withTestEnv(projectConfig, async ({ productDir }) => {
        await resolveConfig(productDir, [
          specTreeConfigDescriptor,
          probe.descriptor,
        ]);

        expect(probe.seen).toEqual([{ [CONFIG_TEST_FIELDS.TOKEN]: token }]);
        for (const observation of probe.seen) {
          expect(observation).not.toHaveProperty(
            sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeKindField()),
          );
          expect(observation).not.toHaveProperty(
            specTreeConfigDescriptor.section,
          );
        }
      });
    });

    it("does not invoke the validator when config content omits the section — defaults are trusted and returned as-is", async () => {
      const probe = spyDescriptor(
        sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      );

      await withTestEnv({}, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [probe.descriptor]);

        expect(probe.seen).toEqual([]);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value[probe.descriptor.section]).toEqual(
            probe.descriptor.defaults,
          );
        }
      });
    });
  });
}
