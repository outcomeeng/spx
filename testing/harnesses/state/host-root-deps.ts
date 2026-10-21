import type { HostRootDependencies } from "@/lib/state-store/host-root";
import type { HostRootScenario } from "@testing/generators/state-store/host-root";

export function createHostRootDependencies(scenario: HostRootScenario): HostRootDependencies {
  return {
    accountHomeDirectory: () => scenario.accountHome,
    environment: (name) => scenario.environment[name],
  };
}
