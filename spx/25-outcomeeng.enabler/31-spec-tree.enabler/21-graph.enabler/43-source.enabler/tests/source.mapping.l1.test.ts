import { describe, expect, it } from "vitest";

import { classifySourceOwnership, SOURCE_OWNERSHIP_CLASSIFICATION } from "@/outcomeeng/spec-tree/graph/source";
import { arbitraryOwnershipScenario } from "@testing/generators/outcomeeng/source-graph";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("source artifact ownership classification", () => {
  it.each(Object.values(SOURCE_OWNERSHIP_CLASSIFICATION))(
    "maps provider facts and linked tests to %s",
    (classification) => {
      assertProperty(
        arbitraryOwnershipScenario(classification),
        (scenario) => {
          const records = classifySourceOwnership(scenario.input);
          expect(records.map((record) => record.sourcePath)).toStrictEqual([scenario.sourcePath]);
          expect(records.at(0)?.classification).toBe(classification);
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    },
  );
});
