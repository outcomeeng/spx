import { describe, expect, it } from "vitest";

import { DEFAULT_METHODOLOGY_CONFIG, METHODOLOGY_SECTION } from "@/config/methodology";
import {
  observeExplicitMethodologyConfigResolves,
  observeMethodologyDefaultsResolveFromProductionRegistry,
} from "@testing/harnesses/config/methodology";

describe("methodology config scenarios", () => {
  it("resolves methodology defaults from the production registry", async () => {
    const result = await observeMethodologyDefaultsResolveFromProductionRegistry();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value[METHODOLOGY_SECTION]).toEqual(DEFAULT_METHODOLOGY_CONFIG);
  });

  it("resolves explicit methodology config", async () => {
    const observation = await observeExplicitMethodologyConfigResolves();
    expect(observation.result.ok).toBe(true);
    if (!observation.result.ok) throw new Error(observation.result.error);
    expect(observation.result.value[METHODOLOGY_SECTION]).toEqual(observation.methodology);
  });
});
