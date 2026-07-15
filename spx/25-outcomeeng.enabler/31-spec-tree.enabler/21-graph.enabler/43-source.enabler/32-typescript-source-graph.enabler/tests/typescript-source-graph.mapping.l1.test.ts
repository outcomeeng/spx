import { describe, expect, it } from "vitest";

import { TYPESCRIPT_COVERAGE_PROVIDER, TYPESCRIPT_MODULE_GRAPH_PROVIDER } from "@/outcomeeng/spec-tree/graph/source";
import {
  arbitraryTypescriptCoverageScenario,
  arbitraryTypescriptModuleGraphScenario,
} from "@testing/generators/outcomeeng/typescript-source-graph";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("typescript source graph provider fact mappings", () => {
  it("maps every test-attributed coverage entry to one coverage fact with typescript provenance", () => {
    assertProperty(
      arbitraryTypescriptCoverageScenario(),
      (scenario) => {
        expect(TYPESCRIPT_COVERAGE_PROVIDER.collectFacts(scenario.input)).toStrictEqual(scenario.expectedFacts);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("maps every module reachable from a test entry to one reachability fact with typescript provenance", () => {
    assertProperty(
      arbitraryTypescriptModuleGraphScenario(),
      (scenario) => {
        expect(TYPESCRIPT_MODULE_GRAPH_PROVIDER.collectFacts(scenario.input)).toStrictEqual(scenario.expectedFacts);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
