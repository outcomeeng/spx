import {
  type ConfigFileReadResult,
  readConfigSectionFromReadResult,
  readProductConfigFile,
  resolveConfigFromReadResult,
} from "@/config/index";
import { METHODOLOGY_SECTION, type MethodologyConfig, methodologyConfigDescriptor } from "@/config/methodology";
import type { Result } from "@/config/types";
import {
  HARNESS_ENVIRONMENT_SECTION,
  harnessEnvironmentUnknownConfigFieldError,
  isHarnessEnvironmentUnknownConfigFieldError,
} from "@/domains/agent-environment/config";

export const LEGACY_METHODOLOGY_CONFIG_SECTION = HARNESS_ENVIRONMENT_SECTION;

export function isLegacyHarnessMethodologyConfigError(error: string): boolean {
  return isHarnessEnvironmentUnknownConfigFieldError(error, METHODOLOGY_SECTION);
}

function rejectLegacyHarnessMethodologyConfig(detected: ConfigFileReadResult): Result<undefined> {
  const harnessEnvironment = readConfigSectionFromReadResult(detected, LEGACY_METHODOLOGY_CONFIG_SECTION);
  if (!harnessEnvironment.ok) return harnessEnvironment;
  if (hasLegacyHarnessMethodologyConfig(harnessEnvironment.value)) {
    return { ok: false, error: harnessEnvironmentUnknownConfigFieldError(METHODOLOGY_SECTION) };
  }
  return { ok: true, value: undefined };
}

function hasLegacyHarnessMethodologyConfig(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.hasOwn(value, METHODOLOGY_SECTION);
}

export async function resolveMethodologyConfig(productDir: string): Promise<Result<MethodologyConfig>> {
  const detected = await readProductConfigFile(productDir);
  if (!detected.ok) return detected;

  const legacyPlacement = rejectLegacyHarnessMethodologyConfig(detected.value);
  if (!legacyPlacement.ok) return legacyPlacement;

  const loaded = resolveConfigFromReadResult(detected.value, [methodologyConfigDescriptor]);
  if (!loaded.ok) return loaded;
  return { ok: true, value: loaded.value[methodologyConfigDescriptor.section] as MethodologyConfig };
}
