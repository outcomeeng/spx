import { describe, it } from "vitest";

import {
  assertSpecContextIncludesCitedDecisionsWithProvenance,
  assertSpecContextRejectsMissingCitedDecision,
} from "@testing/harnesses/spec/context";

describe("spec context cited decisions", () => {
  it("includes transitively cited decisions once each with citing-file provenance", async () => {
    await assertSpecContextIncludesCitedDecisionsWithProvenance();
  });

  it("fails naming the cited path and the citing document when a cited decision is absent", async () => {
    await assertSpecContextRejectsMissingCitedDecision();
  });
});
