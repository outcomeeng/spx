import { describe, it } from "vitest";

import {
  assertCoverageEntriesMapToCoverageFacts,
  assertReachableModulesMapToReachabilityFacts,
} from "@testing/harnesses/outcomeeng/typescript-source-graph";

describe("typescript source graph provider fact mappings", () => {
  it("maps every test-attributed coverage entry to one coverage fact with typescript provenance", () => {
    assertCoverageEntriesMapToCoverageFacts();
  });

  it("maps every module reachable from a test entry to one reachability fact with typescript provenance", () => {
    assertReachableModulesMapToReachabilityFacts();
  });
});
