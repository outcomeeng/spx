import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  assertProperty,
  PROPERTY_LEVEL,
  PROPERTY_SIZE,
  type PropertyClassification,
  PropertyFailureError,
  resolveRunCount,
  SPX_PROPERTY_SEED_ENV,
} from "@testing/harnesses/property/property";

const smallL1: PropertyClassification = { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL };

function drawnSeed(): number {
  return fc.sample(fc.integer(), { numRuns: 1 })[0];
}

function captureFailure(
  deps: { drawSeed?: () => number; env?: Record<string, string | undefined> },
): PropertyFailureError {
  try {
    // Pin env to {} so an SPX_PROPERTY_SEED in the real process environment cannot
    // override the injected drawSeed; callers override env explicitly when testing it.
    assertProperty(fc.integer(), () => false, smallL1, { env: {}, ...deps });
  } catch (error) {
    if (error instanceof PropertyFailureError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected the property to fail");
}

describe("assertProperty runs a property under harness-owned policy", () => {
  it("exercises the predicate across the resolved run count when the property holds", () => {
    let calls = 0;
    assertProperty(
      fc.integer(),
      (value) => {
        calls += 1;
        return Number.isInteger(value);
      },
      smallL1,
    );
    expect(calls).toBe(resolveRunCount(smallL1));
  });

  it("resolves when an asynchronous property holds", async () => {
    await expect(
      assertProperty(fc.integer(), async (value) => Number.isInteger(value), smallL1),
    ).resolves.toBeUndefined();
  });

  it("throws a structured failure carrying the run seed and the shrunk counterexample", () => {
    const seed = drawnSeed();
    const failure = captureFailure({ drawSeed: () => seed });
    expect(failure.seed).toBe(seed);
    expect(failure.counterexample).toBeDefined();
  });

  it("throws a structured failure carrying the run seed for a failing asynchronous property", async () => {
    const seed = drawnSeed();
    let captured: unknown;
    try {
      await assertProperty(fc.integer(), async () => false, smallL1, { env: {}, drawSeed: () => seed });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PropertyFailureError);
    expect((captured as PropertyFailureError).seed).toBe(seed);
    expect((captured as PropertyFailureError).counterexample).toBeDefined();
  });

  it("preserves a throwing predicate's error as the failure cause", () => {
    const seed = drawnSeed();
    const thrown = new Error("predicate boom");
    let captured: unknown;
    try {
      assertProperty(
        fc.integer(),
        () => {
          throw thrown;
        },
        smallL1,
        { env: {}, drawSeed: () => seed },
      );
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PropertyFailureError);
    expect((captured as PropertyFailureError).cause).toBeDefined();
  });

  it("fails with a diagnostic when a non-async predicate returns a Promise", async () => {
    let captured: unknown;
    try {
      await assertProperty(fc.integer(), (value) => Promise.resolve(Number.isInteger(value)), smallL1);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PropertyFailureError);
    expect((captured as PropertyFailureError).cause).toBeInstanceOf(TypeError);
    expect(((captured as PropertyFailureError).cause as TypeError).message).toMatch(/declare.*async/i);
  });

  it("replays the identical failing case when SPX_PROPERTY_SEED holds the reported seed", () => {
    const seed = drawnSeed();
    const viaDraw = captureFailure({ drawSeed: () => seed });
    const viaEnv = captureFailure({ env: { [SPX_PROPERTY_SEED_ENV]: String(seed) } });
    expect(viaEnv.seed).toBe(seed);
    expect(viaEnv.counterexample).toStrictEqual(viaDraw.counterexample);
  });
});
