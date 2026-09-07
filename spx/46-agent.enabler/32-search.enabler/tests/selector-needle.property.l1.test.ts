import { describe, it } from "vitest";

import { AgentSearchNeedleError } from "@/domains/agent/search";

import { arbitraryInvalidNeedleCase } from "@testing/generators/agent/locator";
import { arbitraryMovingSessionBranchScenario } from "@testing/generators/agent/search";
import { searchWithRejectedNeedle } from "@testing/harnesses/agent/locator";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

import * as fc from "fast-check";

describe("agent search — selector needle boundary", () => {
  it("rejects an empty or line-terminator-bearing selector value before any store read or locator call", async () => {
    await assertProperty(
      fc.tuple(arbitraryMovingSessionBranchScenario(), arbitraryInvalidNeedleCase()),
      async ([scenario, invalidCase]): Promise<boolean> => {
        const observation = await searchWithRejectedNeedle(scenario, invalidCase);
        return observation.error instanceof AgentSearchNeedleError
          && observation.error.selector === invalidCase.selector
          && observation.results.length === 0
          && observation.fs.headReadPaths().length === 0
          && observation.fs.textReadPaths().length === 0
          && observation.fs.readDirPaths().length === 0
          && observation.locator.calls().length === 0;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
