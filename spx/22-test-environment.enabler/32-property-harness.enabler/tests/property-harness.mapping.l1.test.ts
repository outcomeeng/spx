import { describe, expect, it } from "vitest";

import {
  PROPERTY_LEVEL,
  PROPERTY_RUN_COUNTS,
  PROPERTY_SIZE,
  PROPERTY_TIMEOUTS_MS,
  resolveRunCount,
  resolveTimeout,
} from "@testing/harnesses/property/property";

describe("classification resolves to harness-owned execution policy", () => {
  it("maps each size to its source-owned run count", () => {
    for (const size of Object.values(PROPERTY_SIZE)) {
      expect(resolveRunCount({ level: PROPERTY_LEVEL.L1, size })).toBe(PROPERTY_RUN_COUNTS[size]);
    }
  });

  it("maps each level to its source-owned per-run timeout", () => {
    for (const level of Object.values(PROPERTY_LEVEL)) {
      expect(resolveTimeout({ level })).toBe(PROPERTY_TIMEOUTS_MS[level]);
    }
  });

  it("defaults an omitted size to the standard run count", () => {
    expect(resolveRunCount({ level: PROPERTY_LEVEL.L1 })).toBe(PROPERTY_RUN_COUNTS[PROPERTY_SIZE.STANDARD]);
  });
});
