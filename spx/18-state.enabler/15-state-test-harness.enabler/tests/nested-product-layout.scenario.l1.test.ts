import { describe, expect, it } from "vitest";

import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryLayoutWithConfigAtInvocationAndRoot } from "@testing/generators/state/nested-product-layout";
import { materializeNestedProductLayout } from "@testing/harnesses/state/nested-product-layout";

describe("state test harness — nested-product layout materialization", () => {
  it("places spx.config.* and a product spec only at the declared levels, each carrying that level's title and configuration value", async () => {
    const layout = sampleGeneratedValue(arbitraryLayoutWithConfigAtInvocationAndRoot());

    await materializeNestedProductLayout(layout, async (observation) => {
      expect(observation.levels.map((level) => level.relativePath)).toEqual(
        layout.levels.map((level) => level.relativePath),
      );
      for (const [index, declared] of layout.levels.entries()) {
        const observed = observation.levels[index];
        if (declared.placed === null) {
          expect(observed.configFile).toBeNull();
          expect(observed.specFile).toBeNull();
          continue;
        }
        expect(observed.configFile?.value).toBe(declared.placed.configValue);
        expect(observed.specFile?.title).toBe(declared.placed.title);
      }
      expect(layout.levels.filter((level) => level.placed !== null).length).toBeGreaterThanOrEqual(2);
    });
  });
});
