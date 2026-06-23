import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  assertProperty,
  PROPERTY_LEVEL,
  PROPERTY_SIZE,
  type PropertyClassification,
  resolveSeed,
  SPX_PROPERTY_SEED_ENV,
} from "@testing/harnesses/property/property";

const smallL1: PropertyClassification = { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL };

const arbitraryNonIntegerText = fc.string().filter((value) => !/^\s*-?\d+\s*$/.test(value));

// The pure resolvers are exercised through fc.check plus an explicit expect rather than
// assertProperty, so each it block carries a recognized assertion (SonarCloud S2699); the
// failing counterexample surfaces in the toBeNull failure.
describe("seed resolution is total", () => {
  it("returns the parsed env seed when SPX_PROPERTY_SEED holds an integer", () => {
    const details = fc.check(
      fc.property(
        fc.integer(),
        fc.integer(),
        (envSeed, drawn) => resolveSeed({ [SPX_PROPERTY_SEED_ENV]: String(envSeed) }, () => drawn) === envSeed,
      ),
    );
    expect(details.counterexample).toBeNull();
  });

  it("falls back to the drawn seed when SPX_PROPERTY_SEED is absent or not an integer", () => {
    const details = fc.check(
      fc.property(fc.integer(), fc.option(arbitraryNonIntegerText, { nil: undefined }), (drawn, envValue) => {
        const env = envValue === undefined ? {} : { [SPX_PROPERTY_SEED_ENV]: envValue };
        return resolveSeed(env, () => drawn) === drawn;
      }),
    );
    expect(details.counterexample).toBeNull();
  });
});

describe("a fixed seed drives an identical case sequence through the harness", () => {
  it("passes the predicate the same generated values across two runs at the same seed", () => {
    const details = fc.check(
      fc.property(fc.integer(), (seed) => {
        const recordCases = (): readonly number[] => {
          const seen: number[] = [];
          assertProperty(
            fc.integer(),
            (value) => {
              seen.push(value);
              return true;
            },
            smallL1,
            { env: { [SPX_PROPERTY_SEED_ENV]: String(seed) } },
          );
          return seen;
        };
        const firstRun = recordCases();
        const secondRun = recordCases();
        return JSON.stringify(firstRun) === JSON.stringify(secondRun);
      }),
    );
    expect(details.counterexample).toBeNull();
  });
});
