import { describe, it } from "vitest";

import {
  assertChangedSetPlanningOperandUnionDeduplicates,
  assertChangedSetPlanningPathPartitionIsOrderIndependent,
} from "@testing/harnesses/testing/changed-set-planning";

describe("changed-set planning invariants", () => {
  it("partitions changed paths independent of order and repetition", () => {
    assertChangedSetPlanningPathPartitionIsOrderIndependent();
  });

  it("deduplicates the union of path-selected operands and related test paths", () => {
    assertChangedSetPlanningOperandUnionDeduplicates();
  });
});
