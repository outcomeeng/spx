import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { arbitraryPropertyValue } from "@testing/generators/property/property";
import { SAMPLE_GENERATOR_PARAMETERS, sampleGeneratedValue } from "@testing/generators/sample";

describe("sampleGeneratedValue", () => {
  it("matches fast-check under the source-owned pinned parameters", () => {
    const arbitrary = arbitraryPropertyValue();

    expect(sampleGeneratedValue(arbitrary)).toBe(fc.sample(arbitrary, SAMPLE_GENERATOR_PARAMETERS)[0]);
  });

  it("reproduces the same case on repeated draws", () => {
    const arbitrary = arbitraryPropertyValue();

    expect(sampleGeneratedValue(arbitrary)).toBe(sampleGeneratedValue(arbitrary));
  });
});
