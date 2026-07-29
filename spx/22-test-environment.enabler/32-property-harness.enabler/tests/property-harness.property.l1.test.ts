import { describe, expect, it } from "vitest";

import {
  arbitraryDrawnSeedAndInvalidEnvironment,
  arbitraryPropertySeed,
  arbitraryPropertySeedPair,
  arbitraryPropertyValue,
} from "@testing/generators/property/property";
import {
  assertProperty,
  PROPERTY_CLASSIFICATION,
  resolveSeed,
  SPX_PROPERTY_SEED_ENV,
} from "@testing/harnesses/property/property";

describe("seed resolution is total", () => {
  it("returns the parsed environment seed for every integer seed", () => {
    assertProperty(
      arbitraryPropertySeedPair(),
      ([environmentSeed, drawnSeed]) => {
        expect(resolveSeed({ [SPX_PROPERTY_SEED_ENV]: String(environmentSeed) }, () => drawnSeed)).toBe(
          environmentSeed,
        );
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("returns the drawn seed for every absent or non-integer environment value", () => {
    assertProperty(
      arbitraryDrawnSeedAndInvalidEnvironment(),
      ([drawnSeed, environmentValue]) => {
        expect(
          resolveSeed(
            environmentValue === undefined ? {} : { [SPX_PROPERTY_SEED_ENV]: environmentValue },
            () => drawnSeed,
          ),
        ).toBe(drawnSeed);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});

describe("a fixed seed drives an identical case sequence through the harness", () => {
  it("passes the predicate the same generated values across two runs at the same seed", () => {
    assertProperty(
      arbitraryPropertySeed(),
      (seed) => {
        const firstRun: number[] = [];
        const secondRun: number[] = [];

        assertProperty(
          arbitraryPropertyValue(),
          (value) => {
            firstRun.push(value);
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
          { env: { [SPX_PROPERTY_SEED_ENV]: String(seed) } },
        );
        assertProperty(
          arbitraryPropertyValue(),
          (value) => {
            secondRun.push(value);
          },
          PROPERTY_CLASSIFICATION.SMALL_L1,
          { env: { [SPX_PROPERTY_SEED_ENV]: String(seed) } },
        );

        expect(firstRun).toStrictEqual(secondRun);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
