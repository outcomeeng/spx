import { describe, expect, it } from "vitest";

import {
  arbitraryPropertySeed,
  arbitraryPropertyValue,
  arbitraryShrinkingFailureInput,
  expectedShrunkCounterexample,
} from "@testing/generators/property/property";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  assertProperty,
  PromiseReturningSyncPredicateError,
  PROPERTY_CLASSIFICATION,
  PropertyFailureError,
  resolveRunCount,
  SPX_PROPERTY_SEED_ENV,
} from "@testing/harnesses/property/property";

describe("assertProperty runs a property under harness-owned policy", () => {
  it("exercises the predicate across the resolved run count when the property holds", () => {
    let calls = 0;
    assertProperty(
      arbitraryPropertyValue(),
      (value) => {
        calls += 1;
        return Number.isInteger(value);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
    expect(calls).toBe(resolveRunCount(PROPERTY_CLASSIFICATION.SMALL_L1));
  });

  it("resolves when an asynchronous property holds", async () => {
    await expect(
      assertProperty(
        arbitraryPropertyValue(),
        async (value) => Number.isInteger(value),
        PROPERTY_CLASSIFICATION.SMALL_L1,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws a structured failure carrying the run seed and shrunk counterexample", () => {
    const seed = sampleGeneratedValue(arbitraryPropertySeed());
    let captured: unknown;
    try {
      assertProperty(
        arbitraryShrinkingFailureInput(),
        () => false,
        PROPERTY_CLASSIFICATION.SMALL_L1,
        { env: {}, drawSeed: () => seed },
      );
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PropertyFailureError);
    expect((captured as PropertyFailureError).seed).toBe(seed);
    expect((captured as PropertyFailureError).counterexample).toStrictEqual(expectedShrunkCounterexample());
  });

  it("throws a structured failure carrying the run seed for a failing asynchronous property", async () => {
    const seed = sampleGeneratedValue(arbitraryPropertySeed());
    let captured: unknown;
    try {
      await assertProperty(
        arbitraryPropertyValue(),
        async () => false,
        PROPERTY_CLASSIFICATION.SMALL_L1,
        { env: {}, drawSeed: () => seed },
      );
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PropertyFailureError);
    expect((captured as PropertyFailureError).seed).toBe(seed);
    expect((captured as PropertyFailureError).counterexample).toBeDefined();
  });

  it("preserves a throwing predicate's error as the failure cause", () => {
    const seed = sampleGeneratedValue(arbitraryPropertySeed());
    const thrown = new Error(String(sampleGeneratedValue(arbitraryPropertyValue())));
    let captured: unknown;
    try {
      assertProperty(
        arbitraryPropertyValue(),
        () => {
          throw thrown;
        },
        PROPERTY_CLASSIFICATION.SMALL_L1,
        { env: {}, drawSeed: () => seed },
      );
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PropertyFailureError);
    expect((captured as PropertyFailureError).cause).toBe(thrown);
  });

  it("fails with a typed diagnostic when a non-async predicate returns a Promise", async () => {
    let captured: unknown;
    try {
      await assertProperty(
        arbitraryPropertyValue(),
        (value) => Promise.resolve(Number.isInteger(value)),
        PROPERTY_CLASSIFICATION.SMALL_L1,
      );
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PropertyFailureError);
    expect((captured as PropertyFailureError).cause).toBeInstanceOf(PromiseReturningSyncPredicateError);
  });

  it("replays the identical failing case when SPX_PROPERTY_SEED holds the reported seed", () => {
    const seed = sampleGeneratedValue(arbitraryPropertySeed());
    let viaDraw: unknown;
    let viaEnvironment: unknown;
    try {
      assertProperty(
        arbitraryPropertyValue(),
        () => false,
        PROPERTY_CLASSIFICATION.SMALL_L1,
        { env: {}, drawSeed: () => seed },
      );
    } catch (error) {
      viaDraw = error;
    }
    try {
      assertProperty(
        arbitraryPropertyValue(),
        () => false,
        PROPERTY_CLASSIFICATION.SMALL_L1,
        { env: { [SPX_PROPERTY_SEED_ENV]: String(seed) } },
      );
    } catch (error) {
      viaEnvironment = error;
    }
    expect(viaDraw).toBeInstanceOf(PropertyFailureError);
    expect(viaEnvironment).toBeInstanceOf(PropertyFailureError);
    expect((viaEnvironment as PropertyFailureError).seed).toBe(seed);
    expect((viaEnvironment as PropertyFailureError).counterexample).toStrictEqual(
      (viaDraw as PropertyFailureError).counterexample,
    );
  });
});
