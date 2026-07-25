import { describe, expect, it } from "vitest";

import { DEFAULT_METHODOLOGY_CONFIG, METHODOLOGY_SECTION } from "@/config/methodology";
import {
  resolveExplicitMethodologyConfig,
  resolveMethodologyDefaultsFromProductionRegistry,
} from "@testing/harnesses/config/methodology";

describe("methodology config scenarios", () => {
  it("resolves methodology defaults from the production registry", async () => {
    const resolved = await resolveMethodologyDefaultsFromProductionRegistry();

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value[METHODOLOGY_SECTION]).toEqual(DEFAULT_METHODOLOGY_CONFIG);
  });

  it("resolves explicit methodology config", async () => {
    const { declared, resolved } = await resolveExplicitMethodologyConfig();

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value[METHODOLOGY_SECTION]).toEqual(declared);
  });
});
