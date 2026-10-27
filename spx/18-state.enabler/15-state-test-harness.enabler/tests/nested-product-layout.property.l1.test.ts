import { describe, it } from "vitest";

import { arbitraryNestedProductLayout } from "@testing/generators/state/nested-product-layout";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("state test harness — nested-product layout generation", () => {
  it("declares the invocation directory outside a repository, otherwise the nearest placed level up to the repository root, else the repository root", () => {
    assertProperty(
      arbitraryNestedProductLayout(),
      (layout) => {
        if (!layout.insideRepository) {
          return layout.declaredLocalProductRoot === layout.invocationPath;
        }
        const invocationIndex = layout.levels.findIndex((level) => level.relativePath === layout.invocationPath);
        const upward = layout.levels.slice(invocationIndex);
        const nearestPlaced = upward.find((level) => level.placed !== null);
        const expected = nearestPlaced?.relativePath ?? upward[upward.length - 1].relativePath;
        return layout.declaredLocalProductRoot === expected;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("gives every placed level a title and a configuration value distinct from every other placed level", () => {
    assertProperty(
      arbitraryNestedProductLayout(),
      (layout) => {
        const placed = layout.levels.flatMap((level) => level.placed === null ? [] : [level.placed]);
        return new Set(placed.map((level) => level.title)).size === placed.length
          && new Set(placed.map((level) => level.configValue)).size === placed.length;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
