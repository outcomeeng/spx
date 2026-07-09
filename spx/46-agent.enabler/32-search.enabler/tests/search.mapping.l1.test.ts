import { describe, it } from "vitest";

import {
  assertAgentSearchBranchAssociationSignalMappings,
  assertAgentSearchBranchCommandEvidenceMappings,
  assertAgentSearchDefaultsToRecentBoundedAllAgentSearch,
  assertAgentSearchOptionBehaviorMappings,
  assertAgentSearchOptionMappings,
} from "@testing/harnesses/agent/search";

describe("agent session search option mappings", () => {
  it("maps every search option to query shape", () => {
    assertAgentSearchOptionMappings();
  });

  it("maps result-bound options to search behavior", async () => {
    await assertAgentSearchOptionBehaviorMappings();
  });

  it("maps accepted branch command evidence to branch association", () => {
    assertAgentSearchBranchCommandEvidenceMappings();
  });

  it("maps branch association sources to branch matches", async () => {
    await assertAgentSearchBranchAssociationSignalMappings();
  });

  it("defaults to recent bounded all-agent search", () => {
    assertAgentSearchDefaultsToRecentBoundedAllAgentSearch();
  });
});
