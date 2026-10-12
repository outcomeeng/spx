import { METHODOLOGY_SECTION } from "@/config/methodology";
import { isHarnessEnvironmentUnknownConfigFieldError } from "@/domains/agent-environment/config";

export function isLegacyHarnessMethodologyConfigError(error: string): boolean {
  return isHarnessEnvironmentUnknownConfigFieldError(error, METHODOLOGY_SECTION);
}
