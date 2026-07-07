import { describe, it } from "vitest";

import {
  assertExplicitMethodologyConfigResolves,
  assertMethodologyDefaultsResolveFromProductionRegistry,
} from "@testing/harnesses/config/methodology";

describe("methodology config scenarios", () => {
  it("resolves methodology defaults from the production registry", async () => {
    await assertMethodologyDefaultsResolveFromProductionRegistry();
  });

  it("resolves explicit methodology config", async () => {
    await assertExplicitMethodologyConfigResolves();
  });
});
