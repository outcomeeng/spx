/**
 * Property-test harness.
 *
 * Wraps fast-check so property tests express only an arbitrary, a predicate, and
 * a classification — the harness owns the run count, per-run timeout, and seed.
 * The seed is read from `SPX_PROPERTY_SEED` when it holds an integer, or drawn
 * fresh otherwise; a failing run throws a {@link PropertyFailureError} carrying
 * the seed and the shrunk counterexample so the caller replays the exact run by
 * exporting `SPX_PROPERTY_SEED`.
 *
 * @module testing/harnesses/property/property
 */

import { randomInt } from "node:crypto";

import fc from "fast-check";

import { SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";

/** Environment variable that pins the seed for deterministic replay. */
export const SPX_PROPERTY_SEED_ENV = "SPX_PROPERTY_SEED";

/** Run-count tiers a classification selects between. */
export const PROPERTY_SIZE = {
  STANDARD: "standard",
  SMALL: "small",
} as const;
export type PropertySize = (typeof PROPERTY_SIZE)[keyof typeof PROPERTY_SIZE];

/** Execution level a classification selects a per-run timeout from, drawn from the spec-tree grammar's level set. */
export type PropertyLevel = (typeof SPEC_TREE_GRAMMAR.EVIDENCE.LEVELS)[number];

/** Named access to the grammar's execution levels; values are constrained to the grammar set. */
export const PROPERTY_LEVEL = {
  L1: "l1",
  L2: "l2",
  L3: "l3",
} as const satisfies Record<string, PropertyLevel>;

/** Number of generated cases per size tier. */
export const PROPERTY_RUN_COUNTS: Record<PropertySize, number> = {
  [PROPERTY_SIZE.STANDARD]: 100,
  [PROPERTY_SIZE.SMALL]: 25,
};

/**
 * Per-run timeout in milliseconds per execution level, applied to async runs. A level whose
 * timeout approaches or exceeds the Vitest test-level timeout requires the caller to raise the
 * Vitest `{ timeout }` for that test, since the test envelope bounds the whole run.
 */
export const PROPERTY_TIMEOUTS_MS: Record<PropertyLevel, number> = {
  [PROPERTY_LEVEL.L1]: 5_000,
  [PROPERTY_LEVEL.L2]: 30_000,
  [PROPERTY_LEVEL.L3]: 120_000,
};

const SEED_MODULUS = 2 ** 32;
const INTEGER_TEXT = /^\s*-?\d+\s*$/;

export interface PropertyClassification {
  readonly level: PropertyLevel;
  readonly size?: PropertySize;
}

export interface PropertyRunDeps {
  readonly env?: Record<string, string | undefined>;
  readonly drawSeed?: () => number;
}

/** Thrown when a property run fails; carries the seed and shrunk counterexample. */
export class PropertyFailureError extends Error {
  readonly seed: number;
  readonly counterexample: unknown;

  constructor(args: { seed: number; counterexample: unknown; numRuns: number; cause?: unknown }) {
    super(
      `Property failed after ${args.numRuns} runs (seed ${args.seed}). `
        + `Replay the failing case with ${SPX_PROPERTY_SEED_ENV}=${args.seed}.`,
      { cause: args.cause },
    );
    this.name = "PropertyFailureError";
    this.seed = args.seed;
    this.counterexample = args.counterexample;
  }
}

function drawRandomSeed(): number {
  return randomInt(SEED_MODULUS);
}

/** Returns the parsed `SPX_PROPERTY_SEED` when it holds an integer, else the drawn seed. */
export function resolveSeed(env: Record<string, string | undefined>, drawSeed: () => number): number {
  const raw = env[SPX_PROPERTY_SEED_ENV];
  if (raw !== undefined && INTEGER_TEXT.test(raw)) {
    // The regex admits only an optionally-signed digit run, so the parse is an integer.
    return Number.parseInt(raw.trim(), 10);
  }
  return drawSeed();
}

/** Returns the run count for a classification's size tier, defaulting to standard. */
export function resolveRunCount(classification: PropertyClassification): number {
  return PROPERTY_RUN_COUNTS[classification.size ?? PROPERTY_SIZE.STANDARD];
}

/** Returns the per-run timeout for a classification's execution level. */
export function resolveTimeout(classification: PropertyClassification): number {
  return PROPERTY_TIMEOUTS_MS[classification.level];
}

function isAsyncPredicate(predicate: unknown): boolean {
  return typeof predicate === "function"
    && (predicate as { readonly constructor: { readonly name: string } }).constructor.name === "AsyncFunction";
}

function failureFrom<T>(details: fc.RunDetails<[T]>, seed: number): PropertyFailureError {
  return new PropertyFailureError({
    seed,
    counterexample: details.counterexample,
    numRuns: details.numRuns,
    cause: details.errorInstance ?? undefined,
  });
}

export function assertProperty<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  classification: PropertyClassification,
  deps?: PropertyRunDeps,
): void;
export function assertProperty<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => Promise<boolean | void>,
  classification: PropertyClassification,
  deps?: PropertyRunDeps,
): Promise<void>;
export function assertProperty<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void | Promise<boolean | void>,
  classification: PropertyClassification,
  deps: PropertyRunDeps = {},
): void | Promise<void> {
  const seed = resolveSeed(deps.env ?? process.env, deps.drawSeed ?? drawRandomSeed);
  const numRuns = resolveRunCount(classification);
  const timeout = resolveTimeout(classification);

  if (isAsyncPredicate(predicate)) {
    const property = fc.asyncProperty(arbitrary, predicate as (value: T) => Promise<boolean | void>);
    return fc.check(property, { seed, numRuns, timeout }).then((details) => {
      if (details.failed) {
        throw failureFrom(details, seed);
      }
    });
  }

  const guardedSyncPredicate = (value: T): boolean | void => {
    const outcome = predicate(value);
    if (outcome != null && typeof (outcome as { then?: unknown }).then === "function") {
      throw new TypeError(
        "assertProperty received a Promise-returning predicate that is not an async function; "
          + "declare the predicate `async` so the harness awaits each generated case.",
      );
    }
    return outcome as boolean | void;
  };

  const details = fc.check(fc.property(arbitrary, guardedSyncPredicate), { seed, numRuns, timeout });
  if (details.failed) {
    throw failureFrom(details, seed);
  }
}
