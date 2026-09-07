import { describe, expect, it } from "vitest";

import { arbitraryLocatorStoreCase } from "@testing/generators/agent/locator";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withRipgrepLocatorStore } from "@testing/harnesses/agent/locator";

describe("agent search — ripgrep transcript locator", () => {
  it("names exactly the transcript whose text carries the needle in a two-file temporary store", async () => {
    await withRipgrepLocatorStore(sampleGeneratedValue(arbitraryLocatorStoreCase()), (observation) => {
      expect(observation.named).toEqual([observation.hitPath]);
      expect(observation.named).not.toContain(observation.missPath);
    });
  });
});
