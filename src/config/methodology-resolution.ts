import { HARNESS_ENVIRONMENT_SECTION } from "../lib/harness-environment-section";

import { formatUnrecognizedConfigFieldError } from "./field-errors";
import { METHODOLOGY_SECTION, type MethodologyConfig, methodologyConfigDescriptor } from "./methodology";
import {
  type ConfigFileReadResult,
  readConfigSectionFromReadResult,
  readProductConfigFile,
  resolveDescriptorSectionsFromReadResult,
} from "./product-file";
import type { Result } from "./types";

/** The section a methodology declaration was once placed under, now rejected wherever the declaration is read. */
const LEGACY_METHODOLOGY_PLACEMENT_SECTION = HARNESS_ENVIRONMENT_SECTION;

function hasLegacyPlacement(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.hasOwn(value, METHODOLOGY_SECTION);
}

function rejectLegacyPlacement(detected: ConfigFileReadResult): Result<undefined> {
  const legacySection = readConfigSectionFromReadResult(detected, LEGACY_METHODOLOGY_PLACEMENT_SECTION);
  if (!legacySection.ok) return legacySection;
  if (hasLegacyPlacement(legacySection.value)) {
    return {
      ok: false,
      error: formatUnrecognizedConfigFieldError(LEGACY_METHODOLOGY_PLACEMENT_SECTION, METHODOLOGY_SECTION),
    };
  }
  return { ok: true, value: undefined };
}

/**
 * The one resolver of a product's methodology declaration: it rejects the legacy
 * placement, then merges the methodology section with its descriptor's defaults and
 * runs the descriptor's validator. It reaches no registry, no config index, and no
 * domain, so the spec-tree library and the config module both import it directly.
 */
export function resolveMethodologyConfigFromReadResult(detected: ConfigFileReadResult): Result<MethodologyConfig> {
  const legacyPlacement = rejectLegacyPlacement(detected);
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
