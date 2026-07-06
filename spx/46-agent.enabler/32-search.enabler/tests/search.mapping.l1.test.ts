import { describe, it } from "vitest";

import {
  assertAgentSearchBranchCommandEvidenceMappings,
  assertAgentSearchDefaultsToRecentBoundedAllAgentSearch,
  assertAgentSearchOptionMappings,
} from "@testing/harnesses/agent/search";

describe("agent session search option mappings", () => {
  it("maps every search option to query shape", () => {
    assertAgentSearchOptionMappings();
  });

  it("maps accepted branch command evidence to branch association", () => {
    assertAgentSearchBranchCommandEvidenceMappings();
  });

  it("defaults to recent bounded all-agent search", () => {
    assertAgentSearchDefaultsToRecentBoundedAllAgentSearch();
  });
});
