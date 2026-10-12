import { METHODOLOGY_SECTION, type MethodologyConfig, methodologyConfigDescriptor } from "@/config/methodology";
import {
  type ConfigFileReadResult,
  readConfigSectionFromReadResult,
  readProductConfigFile,
  resolveDescriptorSectionsFromReadResult,
} from "@/config/product-file";
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

/**
 * The one resolver of a product's methodology declaration: it rejects the legacy
 * placement under the harness-environment section, then merges the methodology
 * section with its descriptor's defaults and runs the descriptor's validator.
 * Every reader of the declaration, the spec-tree source included, goes through it.
 */
export function resolveMethodologyConfigFromReadResult(detected: ConfigFileReadResult): Result<MethodologyConfig> {
  const legacyPlacement = rejectLegacyHarnessMethodologyConfig(detected);
  if (!legacyPlacement.ok) return legacyPlacement;

  const loaded = resolveDescriptorSectionsFromReadResult(detected, [methodologyConfigDescriptor]);
  if (!loaded.ok) return loaded;
  return { ok: true, value: loaded.value[methodologyConfigDescriptor.section] as MethodologyConfig };
}

export async function resolveMethodologyConfig(productDir: string): Promise<Result<MethodologyConfig>> {
  const detected = await readProductConfigFile(productDir);
  if (!detected.ok) return detected;
  return resolveMethodologyConfigFromReadResult(detected.value);
}
