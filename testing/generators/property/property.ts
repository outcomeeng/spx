import fc from "fast-check";

const NON_INTEGER_PREFIX = "x";
const MINIMUM_SHRINKING_INPUT = 1;
const MAXIMUM_SHRINKING_INPUT = 1_000;

export function arbitraryPropertySeed(): fc.Arbitrary<number> {
  return fc.integer();
}

export function arbitraryPropertySeedPair(): fc.Arbitrary<readonly [number, number]> {
  return fc.tuple(arbitraryPropertySeed(), arbitraryPropertySeed());
}

export function arbitraryPropertyValue(): fc.Arbitrary<number> {
  return fc.integer();
}

export function arbitraryAbsentOrNonIntegerSeedText(): fc.Arbitrary<string | undefined> {
  return fc.option(
    fc.string().map((value) => `${NON_INTEGER_PREFIX}${value}`),
    { nil: undefined },
  );
}

export function arbitraryDrawnSeedAndInvalidEnvironment(): fc.Arbitrary<readonly [number, string | undefined]> {
  return fc.tuple(arbitraryPropertySeed(), arbitraryAbsentOrNonIntegerSeedText());
}

export function arbitraryShrinkingFailureInput(): fc.Arbitrary<number> {
  return fc.integer({ min: MINIMUM_SHRINKING_INPUT, max: MAXIMUM_SHRINKING_INPUT });
}

export function expectedShrunkCounterexample(): readonly [number] {
  return [MINIMUM_SHRINKING_INPUT];
}
