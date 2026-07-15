import * as fc from "fast-check";
import { expect } from "vitest";

import { defaultsCommand } from "@/commands/config/defaults";
import { showCommand } from "@/commands/config/show";
import type { CliDeps } from "@/commands/config/types";
import { validateCommand } from "@/commands/config/validate";
import type { Config, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

export function configCliDeps(resolved: Result<Config>): CliDeps {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

  return {
    resolveConfig: async () => resolved,
    readProductConfigFile: async () => sampleConfigTestValue(CONFIG_TEST_GENERATOR.absentConfigFileReadResult()),
    resolveConfigFromReadResult: () => resolved,
    resolveProductDir: () => productDir,
    descriptors: [specTreeConfigDescriptor],
  };
}

export function configCliDefaults(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeDefaultsConfig());
}

export async function assertConfigHandlersDeterministic(): Promise<void> {
  await assertProperty(
    fc.boolean(),
    async (asJson) => {
      const deps = configCliDeps({ ok: true, value: configCliDefaults() });

      expect(await showCommand({ json: asJson }, deps)).toEqual(await showCommand({ json: asJson }, deps));
      expect(await validateCommand({}, deps)).toEqual(await validateCommand({}, deps));
      expect(await defaultsCommand({ json: asJson }, deps)).toEqual(await defaultsCommand({ json: asJson }, deps));
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}
