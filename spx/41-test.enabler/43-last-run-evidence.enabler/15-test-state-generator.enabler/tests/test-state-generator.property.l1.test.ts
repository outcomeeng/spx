import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { TEST_RUN_STATE_STATUS } from "@/test/run-state";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";

describe("test-run-state generator", () => {
  it("draws every generated status from the source-owned status set", () => {
    const statuses = Object.values(TEST_RUN_STATE_STATUS);

    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.testRunState(), (state) => {
        expect(statuses).toContain(state.status);
      }),
    );
  });

  it("produces non-empty, disjoint test-path pairs", () => {
    fc.assert(
      fc.property(TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(), ([first, second]) => {
        expect(first.length).toBeGreaterThan(0);
        expect(second.length).toBeGreaterThan(0);
        expect(first.some((path) => second.includes(path))).toBe(false);
      }),
    );
  });
});
