import { describe, expect, it } from "vitest";

import { findingIdentityKey } from "@/domains/verify/run-set";
import { RUN_SET_TEST_GENERATOR } from "@testing/generators/verify/run-set";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("finding identity properties", () => {
  it("keeps the identity key stable across display-only line, provider-record, and producer-release changes", () => {
    assertProperty(
      RUN_SET_TEST_GENERATOR.findingIdentityStabilityScenario(),
      (scenario) => {
        expect(findingIdentityKey(scenario.first)).toBe(findingIdentityKey(scenario.second));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("changes the identity key when any identity field changes", () => {
    assertProperty(
      RUN_SET_TEST_GENERATOR.findingIdentityStabilityScenario(),
      (scenario) => {
        expect(findingIdentityKey(scenario.mutated)).not.toBe(findingIdentityKey(scenario.first));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
