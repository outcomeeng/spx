import { METHODOLOGY_SECTION } from "@/config/methodology";
import { isHarnessEnvironmentUnknownConfigFieldError } from "@/domains/agent-environment/config";
import { LEGACY_METHODOLOGY_PLACEMENT_SECTION } from "@/lib/methodology/declaration-fields";

export { resolveMethodologyConfig, resolveMethodologyConfigFromReadResult } from "./methodology-resolution";

export const LEGACY_METHODOLOGY_CONFIG_SECTION = LEGACY_METHODOLOGY_PLACEMENT_SECTION;

export function isLegacyHarnessMethodologyConfigError(error: string): boolean {
  return isHarnessEnvironmentUnknownConfigFieldError(error, METHODOLOGY_SECTION);
}
