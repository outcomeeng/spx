import * as fc from "fast-check";

import { type LiteralCommandOptions, OUTPUT_MODE_NAME, type OutputModeName } from "@/commands/validation/literal";
import {
  DEFAULT_MIN_NUMBER_DIGITS,
  DEFAULT_MIN_STRING_LENGTH,
  LITERAL_DEFAULTS,
  type LiteralConfig,
  type LiteralValueAllowlistConfig,
  PRESET_NAMES,
  type PresetName,
  WEB_PRESET_TOKENS,
  type WebPresetToken,
} from "@/validation/literal/config";
import {
  type DetectionResult,
  type DupeFinding,
  LITERAL_KIND,
  type LiteralKind,
  type LiteralLocation,
  MODULE_NAMING_SKIP,
  REMEDIATION,
  type ReuseFinding,
} from "@/validation/literal/index";
import {
  buildNumericDeclaration,
  buildStringDeclaration,
  buildTemplateDeclaration,
} from "@testing/harnesses/literal/snippets";

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
const LITERAL_MULTI_FIXTURE_COUNT = 3;
const LITERAL_PROPERTY_RUN_COUNT = 32;
const LITERAL_SMALL_PROPERTY_RUN_COUNT = 5;
const LITERAL_FINDINGS_MAX_COUNT = 5;
const LITERAL_SECTION_INDENT_WIDTH = 2;
const LITERAL_NESTED_INDENT_WIDTH = 4;
const LITERAL_LIST_INDENT_WIDTH = 6;
const LITERAL_TEXT_LINE_SEPARATOR = "\n";
const PATH_SCOPED_EXCLUDED_ROOT = "excluded-literal-fixtures";

const RESERVED_LITERALS: ReadonlySet<string> = new Set(WEB_PRESET_TOKENS);

const ALL_PRESET_NAMES: ReadonlyArray<PresetName> = Object.values(PRESET_NAMES);

const IMPORT_SYNTAX_EXAMPLES: Readonly<Record<string, { readonly source: string; readonly path: string }>> = {
  ImportDeclaration: {
    source: `import { a } from "./import-decl-path";`,
    path: "./import-decl-path",
  },
  ExportNamedDeclaration: {
    source: `export { x } from "./export-named-path";`,
    path: "./export-named-path",
  },
  ExportAllDeclaration: {
    source: `export * from "./export-all-path";`,
    path: "./export-all-path",
  },
  ImportExpression: {
    source: `const load = () => import("./dynamic-import-path");`,
    path: "./dynamic-import-path",
  },
  TSImportType: {
    source: `type X = import("./type-only-path").Thing;`,
    path: "./type-only-path",
  },
  TSExternalModuleReference: {
    source: `import eq = require("./equals-required-path");`,
    path: "./equals-required-path",
  },
};

const AST_OCCURRENCE_MAPPING_LABEL = {
  STRING_DECLARATION: "stringLiteralDeclaration",
  NUMERIC_DECLARATION: "numericLiteralDeclaration",
  TEMPLATE_DECLARATION: "templateElementDeclaration",
} as const;

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

export function arbitraryLiteralLocation(fileArb: fc.Arbitrary<string>): fc.Arbitrary<LiteralLocation> {
  return fc.record({
    file: fileArb,
    line: fc.nat(),
  });
}

export function arbitraryReuseFinding(): fc.Arbitrary<ReuseFinding> {
  return arbitraryLiteralKindAndValue().chain(({ kind, value }) =>
    fc.record({
      kind: fc.constant(kind),
      value: fc.constant(value),
      test: arbitraryLiteralLocation(arbitraryTestFilePath()),
      src: fc.array(arbitraryLiteralLocation(arbitrarySourceFilePath()), {
        minLength: LITERAL_TEST_GENERATOR_COUNTS.one,
        maxLength: LITERAL_TEST_GENERATOR_COUNTS.multiFixture,
      }),
      remediation: fc.constant(REMEDIATION.IMPORT_FROM_SOURCE),
    })
  );
}

export function arbitraryDupeFinding(): fc.Arbitrary<DupeFinding> {
  return arbitraryLiteralKindAndValue().chain(({ kind, value }) =>
    fc.record({
      kind: fc.constant(kind),
      value: fc.constant(value),
      test: arbitraryLiteralLocation(arbitraryTestFilePath()),
      otherTests: fc.array(arbitraryLiteralLocation(arbitraryTestFilePath()), {
        minLength: LITERAL_TEST_GENERATOR_COUNTS.one,
        maxLength: LITERAL_TEST_GENERATOR_COUNTS.multiFixture,
      }),
      remediation: fc.constant(REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR),
    })
  );
}

function arbitraryLiteralKindAndValue(): fc.Arbitrary<{ readonly kind: LiteralKind; readonly value: string }> {
  return fc.oneof(
    arbitraryDomainLiteral().map((value) => ({ kind: LITERAL_KIND.STRING, value })),
    arbitraryDomainNumber().map((value) => ({ kind: LITERAL_KIND.NUMBER, value: String(value) })),
  );
}

export function arbitraryDetectionResult(): fc.Arbitrary<DetectionResult> {
  return fc.record({
    srcReuse: fc.array(arbitraryReuseFinding(), {
      minLength: LITERAL_TEST_GENERATOR_COUNTS.one,
      maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
    }),
    testDupe: fc.array(arbitraryDupeFinding(), {
      minLength: LITERAL_TEST_GENERATOR_COUNTS.one,
      maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
    }),
  });
}

export function arbitraryNumericDetectionResult(): fc.Arbitrary<DetectionResult> {
  return arbitraryReuseFinding()
    .filter((finding) => finding.kind === LITERAL_KIND.NUMBER)
    .map((finding) => ({ srcReuse: [finding], testDupe: [] }));
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

export interface LiteralSourceReuseFixtureInputs {
  readonly literal: string;
  readonly sourceFile: string;
  readonly testFile: string;
}

export interface LiteralPathScopedSourceReuseFixtureInputs {
  readonly included: LiteralSourceReuseFixtureInputs;
  readonly excluded: LiteralSourceReuseFixtureInputs;
  readonly excludedPathPrefix: string;
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
      return new Set(values).size === values.length
        && !inputs.reuseLiteral.includes(inputs.dupeLiteral)
        && !inputs.dupeLiteral.includes(inputs.reuseLiteral);
    });
}

export function arbitraryLiteralSourceReuseFixtureInputs(): fc.Arbitrary<LiteralSourceReuseFixtureInputs> {
  return fc.record({
    literal: arbitraryDomainLiteral(),
    sourceFile: arbitrarySourceFilePath(),
    testFile: arbitraryTestFilePath(),
  });
}

export function arbitraryLiteralPathScopedSourceReuseFixtureInputs(): fc.Arbitrary<
  LiteralPathScopedSourceReuseFixtureInputs
> {
  return fc
    .record({
      included: arbitraryLiteralSourceReuseFixtureInputs(),
      excludedLiteral: arbitraryDomainLiteral(),
      excludedPathSlug: arbitraryDomainLiteral(),
      excludedSourceSlug: arbitraryDomainLiteral(),
      excludedTestSlug: arbitraryDomainLiteral(),
    })
    .map((inputs) => {
      const excludedPathPrefix = `${PATH_SCOPED_EXCLUDED_ROOT}/${inputs.excludedPathSlug}`;
      return {
        included: inputs.included,
        excludedPathPrefix,
        excluded: {
          literal: inputs.excludedLiteral,
          sourceFile: `${excludedPathPrefix}/${inputs.excludedSourceSlug}.ts`,
          testFile: `${excludedPathPrefix}/${inputs.excludedTestSlug}.test.ts`,
        },
      };
    })
    .filter((inputs) => inputs.included.literal !== inputs.excluded.literal);
}

export function arbitraryLiteralConfig(
  overrides: Partial<LiteralConfig> = {},
): fc.Arbitrary<LiteralConfig> {
  return fc.constant(buildLiteralConfig(overrides));
}

export function arbitraryLiteralValueConfig(
  overrides: LiteralValueAllowlistConfig = {},
): fc.Arbitrary<LiteralValueAllowlistConfig> {
  return fc.constant(overrides);
}

export interface LiteralModuleNamingFixture {
  readonly nodeType: string;
  readonly field: string;
  readonly source: string;
  readonly path: string;
}

export function literalModuleNamingFixtures(): readonly LiteralModuleNamingFixture[] {
  return Object.entries(MODULE_NAMING_SKIP).flatMap(([nodeType, fields]) => {
    const example = IMPORT_SYNTAX_EXAMPLES[nodeType];
    return [...fields].map((field) => ({ nodeType, field, source: example.source, path: example.path }));
  });
}

export function literalAstOccurrenceCases(): readonly {
  readonly label: string;
  readonly buildSource: (value: string) => string;
  readonly buildValue: () => string;
  readonly expectedKind: typeof LITERAL_KIND.STRING | typeof LITERAL_KIND.NUMBER;
}[] {
  return [
    {
      label: AST_OCCURRENCE_MAPPING_LABEL.STRING_DECLARATION,
      buildSource: buildStringDeclaration,
      buildValue: () => sampleLiteralTestValue(arbitraryDomainLiteral()),
      expectedKind: LITERAL_KIND.STRING,
    },
    {
      label: AST_OCCURRENCE_MAPPING_LABEL.NUMERIC_DECLARATION,
      buildSource: buildNumericDeclaration,
      buildValue: () => String(sampleLiteralTestValue(arbitraryDomainNumber())),
      expectedKind: LITERAL_KIND.NUMBER,
    },
    {
      label: AST_OCCURRENCE_MAPPING_LABEL.TEMPLATE_DECLARATION,
      buildSource: buildTemplateDeclaration,
      buildValue: () => sampleLiteralTestValue(arbitraryDomainLiteral()),
      expectedKind: LITERAL_KIND.STRING,
    },
  ];
}

export function sampleDistinctDomainLiterals(count: number): readonly string[] {
  return sampleLiteralTestValue(
    fc.uniqueArray(arbitraryDomainLiteral(), { minLength: count, maxLength: count }),
  );
}

export function sampleIndependentDomainLiterals(count: number): readonly string[] {
  return sampleLiteralTestValue(
    fc
      .uniqueArray(arbitraryDomainLiteral(), { minLength: count, maxLength: count })
      .filter((values) =>
        values.every((candidate, candidateIndex) =>
          values.every((other, otherIndex) =>
            candidateIndex === otherIndex
            || (!candidate.includes(other) && !other.includes(candidate))
          )
        )
      ),
  );
}

export function sampleDistinctTestFilePaths(count: number): readonly string[] {
  return sampleLiteralTestValue(
    fc.uniqueArray(arbitraryTestFilePath(), { minLength: count, maxLength: count }),
  );
}

export function sampleDistinctSourceFilePaths(count: number): readonly string[] {
  return sampleLiteralTestValue(
    fc.uniqueArray(arbitrarySourceFilePath(), { minLength: count, maxLength: count }),
  );
}

export function sampleLiteralSourceReuseFixtures(
  count: number,
): readonly LiteralSourceReuseFixtureInputs[] {
  return sampleLiteralTestValue(
    fc
      .uniqueArray(arbitraryLiteralSourceReuseFixtureInputs(), {
        minLength: count,
        maxLength: count,
        selector: (fixture) => fixture.literal,
      })
      .filter((fixtures) =>
        new Set(fixtures.map((fixture) => fixture.sourceFile)).size === count
        && new Set(fixtures.map((fixture) => fixture.testFile)).size === count
      ),
  );
}

export function sampleLiteralPair(): readonly [string, string] {
  const [first, second] = sampleIndependentDomainLiterals(LITERAL_TEST_GENERATOR_COUNTS.two);
  return [first, second];
}

export function sampleTestFilePathPair(): readonly [string, string] {
  const [first, second] = sampleDistinctTestFilePaths(LITERAL_TEST_GENERATOR_COUNTS.two);
  return [first, second];
}

export function sampleLiteralTriple(): readonly [string, string, string] {
  const [first, second, third] = sampleIndependentDomainLiterals(LITERAL_TEST_GENERATOR_COUNTS.multiFixture);
  return [first, second, third];
}

export function literalOutputModeOptions(mode: OutputModeName): Partial<LiteralCommandOptions> {
  switch (mode) {
    case OUTPUT_MODE_NAME.TEXT:
      return {};
    case OUTPUT_MODE_NAME.VERBOSE:
      return { verbose: true };
    case OUTPUT_MODE_NAME.FILES_WITH_PROBLEMS:
      return { filesWithProblems: true };
    case OUTPUT_MODE_NAME.LITERALS:
      return { literals: true };
    case OUTPUT_MODE_NAME.JSON:
      return { json: true };
  }
}

export function literalEmptyConfig(): Record<string, unknown> {
  return {};
}

export const LITERAL_TEST_GENERATOR_COUNTS = {
  none: 0,
  one: 1,
  two: 2,
  multiFixture: LITERAL_MULTI_FIXTURE_COUNT,
  propertyRuns: LITERAL_PROPERTY_RUN_COUNT,
  smallPropertyRuns: LITERAL_SMALL_PROPERTY_RUN_COUNT,
  findingsMax: LITERAL_FINDINGS_MAX_COUNT,
} as const;

export const LITERAL_TEST_INDEXES = {
  first: 0,
  second: 1,
} as const;

export const LITERAL_TEST_BOUNDS = {
  foundMinimum: 0,
} as const;

export const LITERAL_YAML_LAYOUT = {
  sectionIndentWidth: LITERAL_SECTION_INDENT_WIDTH,
  nestedIndentWidth: LITERAL_NESTED_INDENT_WIDTH,
  listIndentWidth: LITERAL_LIST_INDENT_WIDTH,
} as const;

export const LITERAL_TEXT_LAYOUT = {
  lineSeparator: LITERAL_TEXT_LINE_SEPARATOR,
} as const;

export const LITERAL_TEST_GENERATOR = {
  domainLiteral: arbitraryDomainLiteral,
  domainNumber: arbitraryDomainNumber,
  sourceFilePath: arbitrarySourceFilePath,
  testFilePath: arbitraryTestFilePath,
  webPresetToken: arbitraryWebPresetToken,
  presetName: arbitraryPresetName,
  reuseFixtureInputs: arbitraryLiteralReuseFixtureInputs,
  sourceReuseFixtureInputs: arbitraryLiteralSourceReuseFixtureInputs,
  pathScopedSourceReuseFixtureInputs: arbitraryLiteralPathScopedSourceReuseFixtureInputs,
  literalConfig: arbitraryLiteralConfig,
  literalValueConfig: arbitraryLiteralValueConfig,
  detectionResult: arbitraryDetectionResult,
  numericDetectionResult: arbitraryNumericDetectionResult,
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
