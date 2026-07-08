import {
  type ConfigFileReadResult,
  parseConfigFileSections,
  readProductConfigFile,
  resolveConfigFromReadResult,
} from "@/config/index";
import { METHODOLOGY_SECTION, type MethodologyConfig, methodologyConfigDescriptor } from "@/config/methodology";
import type { Result } from "@/config/types";

export const LEGACY_METHODOLOGY_CONFIG_SECTION = "harnessEnvironment";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectLegacyHarnessMethodologyConfig(detected: ConfigFileReadResult): Result<undefined> {
  if (detected.kind !== "ok") {
    return { ok: true, value: undefined };
  }
  const sections = parseConfigFileSections(detected.file);
  if (!sections.ok) {
    return sections;
  }
  const harnessEnvironment = sections.value[LEGACY_METHODOLOGY_CONFIG_SECTION];
  if (isRecord(harnessEnvironment) && Object.hasOwn(harnessEnvironment, METHODOLOGY_SECTION)) {
    return {
      ok: false,
      error: `${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION} is not a recognized config field`,
    };
  }
  return { ok: true, value: undefined };
}

export function isLegacyHarnessMethodologyConfigError(error: string): boolean {
  return error.startsWith(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
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
