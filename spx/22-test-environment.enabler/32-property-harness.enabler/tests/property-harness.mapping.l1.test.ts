import { describe, expect, it } from "vitest";

import {
  PROPERTY_LEVEL,
  PROPERTY_RUN_COUNTS,
  PROPERTY_SIZE,
  PROPERTY_TEST_ENVELOPE_MARGIN_MS,
  PROPERTY_TIMEOUTS_MS,
  propertyTestEnvelopeTimeoutMs,
  resolveRunCount,
  resolveTimeout,
} from "@testing/harnesses/property/property";

describe("classification resolves to harness-owned execution policy", () => {
  it("maps each size to one positive integer run count that does not vary with level", () => {
    for (const size of Object.values(PROPERTY_SIZE)) {
      for (const level of Object.values(PROPERTY_LEVEL)) {
        expect(resolveRunCount({ level, size })).toBeGreaterThan(0);
        expect(Number.isInteger(resolveRunCount({ level, size }))).toBe(true);
        expect(resolveRunCount({ level, size })).toBe(resolveRunCount({ level: PROPERTY_LEVEL.L1, size }));
      }
    }
  });

  it("maps the small size to a run count reduced below the standard size", () => {
    expect(resolveRunCount({ level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL })).toBeLessThan(
      resolveRunCount({ level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.STANDARD }),
    );
  });

  it("defaults an omitted size to the standard run count", () => {
    for (const level of Object.values(PROPERTY_LEVEL)) {
      expect(resolveRunCount({ level })).toBe(resolveRunCount({ level, size: PROPERTY_SIZE.STANDARD }));
    }
  });

  it("maps each level to its own positive per-run timeout that does not vary with size", () => {
    for (const level of Object.values(PROPERTY_LEVEL)) {
      expect(resolveTimeout({ level })).toBeGreaterThan(0);
      for (const size of Object.values(PROPERTY_SIZE)) {
        expect(resolveTimeout({ level, size })).toBe(resolveTimeout({ level }));
      }
    }
    expect(new Set(Object.values(PROPERTY_LEVEL).map((level) => resolveTimeout({ level }))).size).toBe(
      Object.values(PROPERTY_LEVEL).length,
    );
  });

  it("maps each classification to the product of its run count and its per-run timeout plus the margin", () => {
    for (const size of Object.values(PROPERTY_SIZE)) {
      for (const level of Object.values(PROPERTY_LEVEL)) {
        expect(propertyTestEnvelopeTimeoutMs({ level, size })).toBe(
          PROPERTY_RUN_COUNTS[size] * PROPERTY_TIMEOUTS_MS[level] + PROPERTY_TEST_ENVELOPE_MARGIN_MS,
        );
      }
    }
  });

  it("defaults an omitted size to the envelope of the standard size", () => {
    for (const level of Object.values(PROPERTY_LEVEL)) {
      expect(propertyTestEnvelopeTimeoutMs({ level })).toBe(
        propertyTestEnvelopeTimeoutMs({ level, size: PROPERTY_SIZE.STANDARD }),
      );
    }
  });
});
