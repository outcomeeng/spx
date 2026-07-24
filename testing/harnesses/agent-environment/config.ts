import { type ConfigFileFormat, serializeConfigFileSections } from "@/config/index";
import { HARNESS_ENVIRONMENT_SECTION } from "@/domains/agent-environment/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";

export function sampleUnknownAgent(): string {
  return `unregistered-${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}`;
}

export function sampleUnknownHarnessEnvironmentField(): string {
  return `unknown-${sampleConfigTestValue(CONFIG_TEST_GENERATOR.key())}`;
}

export function sampleUnknownHarnessEnvironmentValue(): string {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
}

export function sampleHarnessEnvironmentKey(): string {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
}

export function harnessEnvironmentPath(...segments: readonly string[]): string {
  return [HARNESS_ENVIRONMENT_SECTION, ...segments].join(".");
}

export function serializeConfig(format: ConfigFileFormat, config: Config): string {
  const serialized = serializeConfigFileSections(format, config);
  if (!serialized.ok) throw new Error(serialized.error);
  return serialized.value;
}
