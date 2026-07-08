import { type ConfigFileReadResult, readProductConfigFile, resolveConfigFromReadResult } from "@/config/index";
import { METHODOLOGY_SECTION, type MethodologyConfig, methodologyConfigDescriptor } from "@/config/methodology";
import type { Result } from "@/config/types";
import { HARNESS_ENVIRONMENT_SECTION, harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";

export const LEGACY_METHODOLOGY_CONFIG_SECTION = HARNESS_ENVIRONMENT_SECTION;

export function isLegacyHarnessMethodologyConfigError(error: string): boolean {
  const directPath = `${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`;
  return error.startsWith(directPath) || error.startsWith(`${LEGACY_METHODOLOGY_CONFIG_SECTION}: ${directPath}`);
}

function rejectLegacyHarnessMethodologyConfig(detected: ConfigFileReadResult): Result<undefined> {
  const loaded = resolveConfigFromReadResult(detected, [harnessEnvironmentConfigDescriptor]);
  if (!loaded.ok && isLegacyHarnessMethodologyConfigError(loaded.error)) return loaded;
  return { ok: true, value: undefined };
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
