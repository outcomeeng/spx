import { expect } from "vitest";

import { type ConfigFileFormat, resolveConfig, serializeConfigFileSections } from "@/config/index";
import { RESULT_VALUE_KEY } from "@/config/types";
import {
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  HARNESS_ENVIRONMENT_SECTION,
  type HarnessEnvironmentConfig,
} from "@/domains/agent-environment/config";
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

export function expectResolvedConfig(result: Awaited<ReturnType<typeof resolveConfig>>): Config {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export function harnessEnvironmentPath(...segments: readonly string[]): string {
  return [HARNESS_ENVIRONMENT_SECTION, ...segments].join(".");
}

export function expectRejectedConfig(
  result: Awaited<ReturnType<typeof resolveConfig>>,
  expectedErrorPath: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(expectedErrorPath);
    expect(RESULT_VALUE_KEY in result).toBe(false);
  }
}

export function assertHarnessEnvironmentConfig(value: unknown): HarnessEnvironmentConfig {
  expect(value).toHaveProperty(HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS);
  expect(value).toHaveProperty(HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS);
  expect(value).toHaveProperty(HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP);
  return value as HarnessEnvironmentConfig;
}

export function serializeConfig(format: ConfigFileFormat, config: Config): string {
  const serialized = serializeConfigFileSections(format, config);
  if (!serialized.ok) throw new Error(serialized.error);
  return serialized.value;
}
