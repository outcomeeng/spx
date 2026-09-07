import { describe, expect, it } from "vitest";

import {
  AGENT_SEARCH_NEEDLE_SELECTORS,
  TRANSCRIPT_LOCATOR_DIAGNOSTIC,
  TranscriptLocatorUnavailableError,
} from "@/domains/agent/search";

import { needleSelectorQueries } from "@testing/generators/agent/locator";
import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { searchWithUnavailableLocator } from "@testing/harnesses/agent/locator";

describe("agent search — locator availability", () => {
  it("maps every needle selector to a ripgrep diagnostic with no transcript read when ripgrep cannot start", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const queries = needleSelectorQueries(scenario);

    expect([...queries.keys()]).toEqual([...AGENT_SEARCH_NEEDLE_SELECTORS]);
    for (const selector of AGENT_SEARCH_NEEDLE_SELECTORS) {
      const observation = await searchWithUnavailableLocator(scenario, queries.get(selector) ?? {});

      expect(observation.error).toBeInstanceOf(TranscriptLocatorUnavailableError);
      expect(observation.error).toMatchObject({ message: TRANSCRIPT_LOCATOR_DIAGNOSTIC.UNAVAILABLE });
      expect(observation.results).toEqual([]);
      expect(observation.fs.textReadPaths()).toEqual([]);
      expect(observation.fs.headReadPaths()).toEqual([]);
    }
  });

  it("maps a selector-free listing to its results when ripgrep cannot start", async () => {
    const scenario = sampleGeneratedValue(arbitraryMovingSessionBranchScenario());
    const observation = await searchWithUnavailableLocator(scenario, {});

    expect(observation.error).toBeNull();
    expect(observation.results.map((result) => result.sessionId)).toContain(scenario.sessionId);
  });
});
