import type { MethodologyConfig } from "@/config/methodology";
import type { HarnessEnvironmentConfig } from "@/domains/agent-environment/config";
import type { CheckName } from "@/domains/diagnose/manifest";

export interface DiagnoseFacts {
  readonly spxFloor?: string;
  readonly checks: readonly CheckName[];
  readonly methodology?: MethodologyConfig;
  readonly methodologyError?: string;
  readonly harnessEnvironment: HarnessEnvironmentConfig;
}
