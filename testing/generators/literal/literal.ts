import * as fc from "fast-check";

import {
  DEFAULT_MIN_NUMBER_DIGITS,
  DEFAULT_MIN_STRING_LENGTH,
  LITERAL_DEFAULTS,
  type LiteralAllowlistConfig,
  type LiteralConfig,
  PRESET_NAMES,
  type PresetName,
  WEB_PRESET_TOKENS,
  type WebPresetToken,
} from "@/validation/literal/config";

const DOMAIN_LITERAL_MIN_LENGTH = DEFAULT_MIN_STRING_LENGTH + 4;
const DOMAIN_LITERAL_MAX_LENGTH = 32;
const SLUG_UNIT_CHARS = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "-",
] as const;

const NUMERIC_LITERAL_MIN_DIGITS = DEFAULT_MIN_NUMBER_DIGITS + 1;
const NUMERIC_LITERAL_MAX_DIGITS = NUMERIC_LITERAL_MIN_DIGITS + 4;

const RESERVED_LITERALS: ReadonlySet<string> = new Set(WEB_PRESET_TOKENS);

const ALL_PRESET_NAMES: ReadonlyArray<PresetName> = Object.values(PRESET_NAMES);

export function arbitraryDomainLiteral(): fc.Arbitrary<string> {
  return fc
    .string({
      unit: fc.constantFrom(...SLUG_UNIT_CHARS),
      minLength: DOMAIN_LITERAL_MIN_LENGTH,
      maxLength: DOMAIN_LITERAL_MAX_LENGTH,
    })
    .filter(
      (s) => !s.startsWith("-") && !s.endsWith("-") && !s.includes("--") && !RESERVED_LITERALS.has(s),
    );
}

export function arbitraryDomainNumber(): fc.Arbitrary<number> {
  const min = 10 ** (NUMERIC_LITERAL_MIN_DIGITS - 1);
  const max = 10 ** NUMERIC_LITERAL_MAX_DIGITS - 1;
  return fc.integer({ min, max });
}

export function arbitrarySourceFilePath(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral().map((slug) => `src/${slug}.ts`);
}

export function arbitraryTestFilePath(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral().map((slug) => `tests/${slug}.test.ts`);
}

export function arbitrarySpecTreeTestFilePath(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral().map((slug) => `spx/${slug}/tests/scenario.l1.test.ts`);
}

export function arbitraryTestMarkerFilePath(): fc.Arbitrary<string> {
  return arbitraryDomainLiteral().map((slug) => `src/${slug}.test.helpers.ts`);
}

export function arbitraryWebPresetToken(): fc.Arbitrary<WebPresetToken> {
  return fc.constantFrom(...WEB_PRESET_TOKENS);
}

export function arbitraryPresetName(): fc.Arbitrary<PresetName> {
  return fc.constantFrom(...ALL_PRESET_NAMES);
}

export interface LiteralReuseFixtureInputs {
  readonly reuseLiteral: string;
  readonly dupeLiteral: string;
  readonly reuseSourceFile: string;
  readonly reuseTestFile: string;
  readonly dupeFirstTestFile: string;
  readonly dupeSecondTestFile: string;
}

export function arbitraryLiteralReuseFixtureInputs(): fc.Arbitrary<LiteralReuseFixtureInputs> {
  return fc
    .record({
      reuseLiteral: arbitraryDomainLiteral(),
      dupeLiteral: arbitraryDomainLiteral(),
      reuseSourceFile: arbitrarySourceFilePath(),
      reuseTestFile: arbitraryTestFilePath(),
      dupeFirstTestFile: arbitraryTestFilePath(),
      dupeSecondTestFile: arbitraryTestFilePath(),
    })
    .filter((inputs) => {
      const values = Object.values(inputs);
      return new Set(values).size === values.length;
    });
}

export function arbitraryLiteralAllowlistConfig(
  overrides: LiteralAllowlistConfig = {},
): fc.Arbitrary<LiteralAllowlistConfig> {
  return fc.constant(overrides);
}

export const LITERAL_TEST_GENERATOR = {
  domainLiteral: arbitraryDomainLiteral,
  domainNumber: arbitraryDomainNumber,
  sourceFilePath: arbitrarySourceFilePath,
  testFilePath: arbitraryTestFilePath,
  webPresetToken: arbitraryWebPresetToken,
  presetName: arbitraryPresetName,
  reuseFixtureInputs: arbitraryLiteralReuseFixtureInputs,
  allowlistConfig: arbitraryLiteralAllowlistConfig,
} as const;

export function sampleLiteralTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Literal test generator returned no sample");
  }
  return value;
}

export function buildLiteralConfig(overrides: Partial<LiteralConfig> = {}): LiteralConfig {
  return {
    ...LITERAL_DEFAULTS,
    ...overrides,
  };
}
