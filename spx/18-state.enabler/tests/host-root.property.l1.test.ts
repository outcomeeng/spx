import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOST_STATE_DIRECTORY,
  HOST_STATE_ROOT_SEGMENTS,
  resolveHostRendezvousRoot,
  resolveHostStateRoot,
  XDG_STATE_HOME_VARIABLE,
} from "@/lib/state-store/host-root";
import {
  arbitraryAbsoluteStateHomeScenario,
  arbitraryHostRootScenario,
  arbitraryUnusableStateHomeScenario,
} from "@testing/generators/state-store/host-root";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { createHostRootDependencies } from "@testing/harnesses/state/host-root-deps";

describe("host-scoped root resolution", () => {
  it("resolves the rendezvous root from the account record home under any HOME and XDG_STATE_HOME", () => {
    assertProperty(
      arbitraryHostRootScenario(XDG_STATE_HOME_VARIABLE),
      (scenario) => {
        expect(resolveHostRendezvousRoot(createHostRootDependencies(scenario))).toBe(
          join(scenario.accountHome, ...HOST_STATE_ROOT_SEGMENTS),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("resolves the host state root under an absolute XDG_STATE_HOME", () => {
    assertProperty(
      arbitraryAbsoluteStateHomeScenario(XDG_STATE_HOME_VARIABLE),
      (scenario) => {
        expect(resolveHostStateRoot(createHostRootDependencies(scenario))).toBe(
          join(scenario.xdgStateHome ?? "", HOST_STATE_DIRECTORY),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("resolves the host state root to the rendezvous root for a relative, empty, or absent XDG_STATE_HOME", () => {
    assertProperty(
      arbitraryUnusableStateHomeScenario(XDG_STATE_HOME_VARIABLE),
      (scenario) => {
        expect(resolveHostStateRoot(createHostRootDependencies(scenario))).toBe(
          join(scenario.accountHome, ...HOST_STATE_ROOT_SEGMENTS),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
