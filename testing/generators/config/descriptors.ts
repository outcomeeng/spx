import * as fc from "fast-check";

import {
  canonicalDescriptorJson,
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_READ_KIND,
  configFileForFormat,
  resolveConfigFromReadResult,
} from "@/config/index";
import {
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  METHODOLOGY_VERSION_FORM,
  type MethodologyVersionForm,
} from "@/config/methodology";
import {
  PATH_FILTER_CONFIG_FIELDS,
  type PathFilterConfig,
  pathFilterObjectError,
  pathFilterStringArrayError,
  validatePathFilterConfig,
} from "@/config/primitives/path-filter";
import type { Config, ConfigDescriptor, Result } from "@/config/types";
import {
  AGENT,
  DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  type HarnessEnvironmentConfig,
} from "@/domains/agent-environment/config";
import { HARNESS_ENVIRONMENT_SECTION } from "@/lib/harness-environment-section";
import { KIND_REGISTRY, SPEC_TREE_CONFIG_FIELDS, SPEC_TREE_SECTION } from "@/lib/spec-tree";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION, type TestingConfig, testingConfigDescriptor } from "@/test/config";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import {
  arbitraryMalformedVersionText,
  arbitraryMethodologyLineVersion,
  arbitraryMethodologyVersion,
  arbitraryMethodologyVersionForms,
  arbitraryMethodologyVersionFormsOnDistinctLines,
  type GeneratedMethodologyVersion,
  type GeneratedMethodologyVersionForms,
  malformedVersionTextShapes,
} from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";

export const CONFIG_TEST_FIELDS = {
  TOKEN: "token",
  MODE: "mode",
} as const;

const ENVIRONMENT_SENTINEL_PREFIX = "SPX_TEST_SENTINEL_";
/** How many malformed values each field draws when the rejection cases are generated. */
/** The field a location-bearing methodology section would carry; the descriptor declares no such field. */
export const METHODOLOGY_LOCATION_FIELD = "location";
const SIMILAR_HARNESS_METHODOLOGY_FIELD = "methodologySource";
const STRAY_HARNESS_FIELD = "strayHarnessField";

type GeneratedTokenSection = {
  readonly [CONFIG_TEST_FIELDS.TOKEN]: string;
};

type GeneratedModeSection = {
  readonly [CONFIG_TEST_FIELDS.MODE]: string;
};

type GeneratedDescriptorOptions = {
  readonly minLength: number;
  readonly maxLength: number;
};

export type GeneratedEnvironmentSentinel = {
  readonly key: string;
  readonly value: string;
};

export type GeneratedConfigEnvironmentCase = {
  readonly descriptorSet: GeneratedDescriptorSet;
  readonly sentinel: GeneratedEnvironmentSentinel;
};

/**
 * The rejection a generated test-scoped descriptor produces when config resolution validates its
 * invalid section: `error` is the resolution error, `section` the descriptor's section, and
 * `validatorMessage` the message the descriptor's own validator returned for the invalid section.
 */
export type GeneratedRejectedDescriptorResolution = {
  readonly error: string;
  readonly section: string;
  readonly validatorMessage: string;
};

export type GeneratedTokenDescriptor = {
  readonly section: string;
  readonly defaults: GeneratedTokenSection;
  readonly descriptor: ConfigDescriptor<GeneratedTokenSection>;
};

export type GeneratedModeDescriptor = {
  readonly section: string;
  readonly defaults: GeneratedModeSection;
  readonly override: GeneratedModeSection;
  readonly invalid: GeneratedModeSection;
  readonly descriptor: ConfigDescriptor<GeneratedModeSection>;
};

export type GeneratedDeclaredSection = GeneratedTokenDescriptor & {
  readonly override: GeneratedTokenSection;
};

/**
 * Test-scoped descriptors with the config content that declares a subset of their sections.
 * `declared` descriptors carry the override their section holds in `config`; `omitted`
 * descriptors have no section in `config`, so their defaults decide the resolved section.
 * Both groups are non-empty in every draw.
 */
export type GeneratedDescriptorSet = {
  readonly descriptors: readonly ConfigDescriptor<unknown>[];
  readonly declared: readonly GeneratedDeclaredSection[];
  readonly omitted: readonly GeneratedTokenDescriptor[];
  readonly config: Config;
};

/**
 * One descriptor whose section holds a different token in each config location: the
 * product directory's own file, a parent directory's file, and a nested directory's file.
 * `unrecognizedName` names a same-directory file that is not a recognized config file.
 */
export type GeneratedResolutionScopeScenario = {
  readonly productDirectory: string;
  readonly nestedDirectory: string;
  readonly unrecognizedName: string;
  readonly descriptor: GeneratedTokenDescriptor;
  readonly parentToken: string;
  readonly rootToken: string;
  readonly nestedToken: string;
};

export type GeneratedDirectoryScope = {
  readonly productDirectory: string;
  readonly nestedDirectory: string;
};

export type GeneratedConfigFormatScenario = {
  readonly config: Config;
};

export type GeneratedConfigCliDeterminismCase = {
  readonly asJson: boolean;
  readonly productDir: string;
  readonly resolutionError: string | undefined;
  readonly readError: string | undefined;
  readonly includeDescriptor: boolean;
};

export type GeneratedInvalidPathFilter = {
  readonly value: unknown;
  readonly path: string;
  readonly error: string;
};

export type GeneratedTestingConfig = {
  readonly config: Record<string, unknown>;
  readonly expected: TestingConfig;
};

export type GeneratedHarnessEnvironmentConfig = {
  readonly config: Record<string, unknown>;
  readonly expected: HarnessEnvironmentConfig;
};

export type GeneratedInvalidMethodologyConfig = {
  readonly config: Config;
  readonly field: string;
};

export const CONFIG_TEST_GENERATOR = {
  configCliDeterminismCase: arbitraryConfigCliDeterminismCase,
  configEnvironmentCase: arbitraryConfigEnvironmentCase,
  descriptorSet: arbitraryDescriptorSet,
  harnessEnvironmentConfig: arbitraryHarnessEnvironmentConfig,
  emptyConfig: arbitraryEmptyConfig,
  environmentSentinel: arbitraryEnvironmentSentinel,
  key: arbitraryConfigKey,
  scalar: arbitraryConfigScalar,
  specTreeKindField: arbitrarySpecTreeKindField,
  rejectedDescriptorResolution: arbitraryRejectedDescriptorResolution,
  specTreeRejectedKindMapConfig: arbitrarySpecTreeRejectedKindMapConfig,
  specTreeArrayKindsConfig: arbitrarySpecTreeArrayKindsConfig,
  tempPrefix: arbitraryTempPrefix,
  tokenDescriptorPair: arbitraryTokenDescriptorPair,
  tokenDescriptor: arbitraryTokenDescriptor,
  tokenDescriptors: arbitraryTokenDescriptors,
  modeDescriptor: arbitraryModeDescriptor,
  productDir: arbitraryProductDir,
  pathFilter: arbitraryPathFilter,
  prefixCohort: arbitraryPrefixCohort,
  invalidPathFilter: arbitraryInvalidPathFilter,
  testingConfig: arbitraryTestingConfig,
  discriminatingTestingConfig: arbitraryDiscriminatingTestingConfig,
  directoryScope: arbitraryDirectoryScope,
  resolutionScopeScenario: arbitraryResolutionScopeScenario,
  configFormatScenario: arbitraryConfigFormatScenario,
} as const;

export type GeneratedSpecTreeArrayKindsConfig = {
  readonly config: Record<string, unknown>;
  readonly selectedKinds: readonly (keyof typeof KIND_REGISTRY)[];
};

export function sampleConfigTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Config test generator returned no sample");
  }
  return value;
}

export function generatedMethodologySection(): Record<string, unknown> {
  return generatedMethodologyIdentity().section;
}

/** A methodology declaration with the drawn version carrying the line its construction derives. */
export function generatedMethodologyIdentity(lines?: fc.Arbitrary<string>): {
  readonly section: Record<string, unknown>;
  readonly version: GeneratedMethodologyVersion;
} {
  const version = sampleGeneratedValue(arbitraryMethodologyVersion(lines));
  return {
    version,
    section: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: version.text,
    },
  };
}

/** A methodology section with an open migration window, with the two exact versions it declares. */
export type GeneratedMigratingMethodology = {
  readonly section: Record<string, unknown>;
  readonly target: GeneratedMethodologyVersion;
  readonly source: GeneratedMethodologyVersion;
};

export function arbitraryMigratingMethodology(
  lines?: fc.Arbitrary<string>,
): fc.Arbitrary<GeneratedMigratingMethodology> {
  return fc
    .record({
      versions: fc.tuple(arbitraryMethodologyVersion(lines), arbitraryMethodologyVersion(lines)).filter((
        [left, right],
      ) => left.text !== right.text),
      sourceSegments: fc.tuple(CONFIG_TEST_GENERATOR.key(), CONFIG_TEST_GENERATOR.key()),
    })
    .map(({ versions: [target, source], sourceSegments }) => ({
      section: {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: sourceSegments.join("/"),
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: target.text,
        [METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]: source.text,
      },
      target,
      source,
    }));
}

export function generatedMigratingMethodology(lines?: fc.Arbitrary<string>): GeneratedMigratingMethodology {
  return sampleGeneratedValue(arbitraryMigratingMethodology(lines));
}

/** A methodology section with an open migration window: two distinct exact versions. */
export function generatedMigratingMethodologySection(): Record<string, unknown> {
  return generatedMigratingMethodology().section;
}

/** A methodology section whose version is malformed text, not an exact version in either accepted form. */
export function generatedNonExactMethodologySection(): Record<string, unknown> {
  return {
    [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
    [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleGeneratedValue(arbitraryMalformedVersionText()),
  };
}

/** A methodology section declaring its version in the `MAJOR.MINOR` form. */
export function generatedLineFormMethodologySection(): Record<string, unknown> {
  return {
    [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
    [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleGeneratedValue(arbitraryMethodologyLineVersion()).text,
  };
}

/**
 * A migrating section whose migration source is the `MAJOR.MINOR` form of one
 * drawn line, beside that line's patched form for a consumer to bound against;
 * the target version sits on another line.
 */
export function generatedLineFormMigratingMethodologySection(): {
  readonly section: Record<string, unknown>;
  readonly forms: GeneratedMethodologyVersionForms;
  readonly target: GeneratedMethodologyVersion;
} {
  const forms = sampleGeneratedValue(arbitraryMethodologyVersionForms());
  const target = sampleGeneratedValue(
    arbitraryMethodologyVersion().filter((candidate) => candidate.line !== forms.line),
  );
  return {
    forms,
    target,
    section: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: target.text,
      [METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]: forms.byForm[METHODOLOGY_VERSION_FORM.LINE],
    },
  };
}

/**
 * A migrating methodology section for every pairing of accepted version forms:
 * the target and the migration source each spelled in one form, on distinct
 * lines, so a rendering that swaps, repeats, or mis-forms either is distinguishable.
 */
export interface GeneratedMigratingMethodologyFormCase {
  readonly section: Record<string, unknown>;
  readonly targetForm: MethodologyVersionForm;
  readonly sourceForm: MethodologyVersionForm;
  readonly target: GeneratedMethodologyVersionForms;
  readonly source: GeneratedMethodologyVersionForms;
}

export function generatedMigratingMethodologyFormCases(
  lines?: fc.Arbitrary<string>,
): readonly GeneratedMigratingMethodologyFormCase[] {
  const [target, source] = sampleGeneratedValue(arbitraryMethodologyVersionFormsOnDistinctLines(lines));
  const methodologySource = generatedMethodologySource();
  const forms = Object.values(METHODOLOGY_VERSION_FORM);
  return forms.flatMap((targetForm) =>
    forms.map((sourceForm) => ({
      targetForm,
      sourceForm,
      target,
      source,
      section: {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodologySource,
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: target.byForm[targetForm],
        [METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]: source.byForm[sourceForm],
      },
    }))
  );
}

/** One line in every accepted form, each spelled as a methodology section declaring that form. */
export function generatedMethodologyVersionFormSections(lines?: fc.Arbitrary<string>): {
  readonly forms: GeneratedMethodologyVersionForms;
  readonly sections: Readonly<Record<string, Record<string, unknown>>>;
} {
  const forms = sampleGeneratedValue(arbitraryMethodologyVersionForms(lines));
  const source = generatedMethodologySource();
  return {
    forms,
    sections: Object.fromEntries(
      Object.entries(forms.byForm).map(([form, version]) => [form, {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: source,
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: version,
      }]),
    ),
  };
}

export function generatedMethodologySource(): string {
  return [
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  ].join("/");
}

/** A methodology section whose migration source is malformed text, not an exact version in either accepted form. */
export function generatedNonExactMigrationSourceSection(): Record<string, unknown> {
  return {
    [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
    [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleGeneratedValue(arbitraryMethodologyVersion()).text,
    [METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]: sampleGeneratedValue(arbitraryMalformedVersionText()),
  };
}

/** A methodology section carrying a location field beside a valid declaration; the descriptor knows no such field. */
export function generatedMethodologyLocationSection(): Record<string, unknown> {
  return {
    ...generatedMethodologySection(),
    [METHODOLOGY_LOCATION_FIELD]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  };
}

/**
 * The shape classes of text that is not an `owner/repository` identifier: empty,
 * a single segment, a traversal or absolute path, or more than two segments.
 */
export function malformedMethodologySourceShapes(): readonly fc.Arbitrary<string>[] {
  const segment = arbitraryPathSegment();
  return [
    fc.constant(""),
    segment,
    segment.map((name) => `../${name}`),
    segment.map((name) => `/${name}`),
    fc.tuple(segment, segment).map(([owner, repository]) => `${owner}/../${repository}`),
    fc.tuple(segment, segment, segment).map((parts) => parts.join("/")),
  ];
}

/** Text that is not an `owner/repository` identifier, drawn across every malformed shape class. */
export function arbitraryMalformedMethodologySource(): fc.Arbitrary<string> {
  return fc.oneof(...malformedMethodologySourceShapes());
}

/** The shape classes of a value that is not an exact methodology version: empty, a non-string, or malformed text. */
export function malformedMethodologyVersionShapes(): readonly fc.Arbitrary<unknown>[] {
  return [fc.constant(""), fc.boolean(), fc.nat(), ...malformedVersionTextShapes()];
}

/** A value that is not an exact methodology version, drawn across every malformed shape class. */
export function arbitraryMalformedMethodologyVersion(): fc.Arbitrary<unknown> {
  return fc.oneof(...malformedMethodologyVersionShapes());
}

/** One seeded draw per malformed shape class, so every rejection branch is exercised and replayable. */
export function generatedInvalidMethodologyConfigs(): readonly GeneratedInvalidMethodologyConfig[] {
  const sources = malformedMethodologySourceShapes().map((shape) => sampleGeneratedValue(shape));
  const versions = malformedMethodologyVersionShapes().map((shape) => sampleGeneratedValue(shape));
  return [
    ...sources.map((source) => ({
      config: {
        [METHODOLOGY_SECTION]: {
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: source,
        },
      },
      field: `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.SOURCE}`,
    })),
    ...versions.map((version) => ({
      config: {
        [METHODOLOGY_SECTION]: {
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: version,
        },
      },
      field: `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.VERSION}`,
    })),
    ...versions.map((migratingFrom) => ({
      config: {
        [METHODOLOGY_SECTION]: {
          [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
          [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleGeneratedValue(arbitraryMethodologyVersion()).text,
          [METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]: migratingFrom,
        },
      },
      field: `${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM}`,
    })),
  ];
}

export function generatedHarnessMethodologyConfig(): Config {
  return {
    [HARNESS_ENVIRONMENT_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
    },
  };
}

export function generatedHarnessMethodologyWithUnknownFieldsConfig(): Config {
  return {
    [HARNESS_ENVIRONMENT_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
      [STRAY_HARNESS_FIELD]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    },
  };
}

export function generatedSimilarHarnessMethodologyFieldConfig(): Config {
  return {
    [HARNESS_ENVIRONMENT_SECTION]: {
      [SIMILAR_HARNESS_METHODOLOGY_FIELD]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    },
  };
}

function arbitraryConfigKey(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9]{5,16}$/).filter((key) => key !== SPEC_TREE_SECTION);
}

function arbitraryConfigScalar(): fc.Arbitrary<string> {
  return fc.uuid();
}

function arbitraryEmptyConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc.constant({});
}

function arbitraryProductDir(): fc.Arbitrary<string> {
  return fc.uuid().map((id) => `/${id}`);
}

function arbitraryPathPattern(): fc.Arbitrary<string> {
  return fc
    .tuple(arbitraryConfigKey(), fc.option(arbitraryConfigKey(), { nil: undefined }))
    .map(([first, second]) => second === undefined ? first : `${first}/${second}`);
}

function arbitraryPathFilterArray(): fc.Arbitrary<readonly string[]> {
  return fc.array(arbitraryPathPattern(), { minLength: 0, maxLength: 4 });
}

function arbitraryPathFilter(): fc.Arbitrary<PathFilterConfig> {
  return fc.oneof(
    fc.constant({}),
    arbitraryPathFilterArray().map((include) => ({ [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: include })),
    arbitraryPathFilterArray().map((exclude) => ({ [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: exclude })),
    fc.record({
      [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: arbitraryPathFilterArray(),
      [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: arbitraryPathFilterArray(),
    }),
  );
}

// The root-directory names the product forbids. No production module declares them,
// so the evidence that proves their absence owns the list.
export const LEGACY_PRODUCT_ROOT_FIELD_NAMES = ["projectRoot", "projectDir"] as const;

function arbitraryNonEmptyPathFilterArray(): fc.Arbitrary<readonly string[]> {
  return fc.array(arbitraryPathPattern(), { minLength: 1, maxLength: 4 });
}

// Every drawn filter carries at least one pattern, so the section it resolves to
// differs from the descriptor's own default under every draw.
function arbitraryDiscriminatingPathFilter(): fc.Arbitrary<PathFilterConfig> {
  return fc.oneof(
    arbitraryNonEmptyPathFilterArray().map((include) => ({ [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: include })),
    arbitraryNonEmptyPathFilterArray().map((exclude) => ({ [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: exclude })),
    fc.record({
      [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: arbitraryNonEmptyPathFilterArray(),
      [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: arbitraryNonEmptyPathFilterArray(),
    }),
  );
}

// Distinct path keys positioned relative to one prefix: `under` lives beneath
// the prefix, `sibling` shares the prefix's leading text but crosses no segment
// boundary, and `outside` lives under an unrelated prefix.
export interface PathFilterPrefixCohort {
  readonly prefix: string;
  readonly under: string;
  readonly sibling: string;
  readonly outside: string;
}

function arbitraryPrefixCohort(): fc.Arbitrary<PathFilterPrefixCohort> {
  return fc
    .uniqueArray(arbitraryConfigKey(), { minLength: 4, maxLength: 4 })
    .map(([prefix, child, suffix, other]) => ({
      prefix,
      under: `${prefix}/${child}`,
      sibling: `${prefix}${suffix}`,
      outside: `${other}/${child}`,
    }));
}

function arbitraryInvalidPathFilter(): fc.Arbitrary<GeneratedInvalidPathFilter> {
  return fc
    .record({
      path: arbitraryConfigKey(),
      invalid: fc.oneof(
        arbitraryInvalidPathFilterObject(),
        arbitraryInvalidPathFilterField(PATH_FILTER_CONFIG_FIELDS.INCLUDE),
        arbitraryInvalidPathFilterField(PATH_FILTER_CONFIG_FIELDS.EXCLUDE),
      ),
    })
    .map(({ path, invalid }) => ({
      value: invalid.value,
      path,
      error: invalid.error(path),
    }));
}

function arbitraryInvalidPathFilterObject(): fc.Arbitrary<{
  readonly value: unknown;
  readonly error: (path: string) => string;
}> {
  return fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.string()),
  ).map((value) => ({
    value,
    error: (path) => pathFilterObjectError(path),
  }));
}

function arbitraryInvalidPathFilterField(field: string): fc.Arbitrary<{
  readonly value: unknown;
  readonly error: (path: string) => string;
}> {
  return fc
    .oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.record({ nested: fc.string() }),
      arbitraryInvalidPathFilterArray(),
    )
    .map((value) => ({
      value: { [field]: value },
      error: (path) => pathFilterStringArrayError(path, field),
    }));
}

function arbitraryInvalidPathFilterArray(): fc.Arbitrary<readonly unknown[]> {
  const invalidEntry = fc.oneof(fc.integer(), fc.boolean(), fc.constant(null));
  return fc.oneof(
    fc.array(invalidEntry, { minLength: 1 }),
    fc.tuple(arbitraryPathPattern(), invalidEntry).map(([valid, invalid]) => [valid, invalid]),
    fc.tuple(invalidEntry, arbitraryPathPattern()).map(([invalid, valid]) => [invalid, valid]),
  );
}

function testingConfigFrom(
  passingScopeFilter: fc.Arbitrary<PathFilterConfig>,
): fc.Arbitrary<GeneratedTestingConfig> {
  return passingScopeFilter.map((passingScope) => {
    const result = validatePathFilterConfig(
      passingScope,
      `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
    );
    if (!result.ok) {
      // Guard the generator contract: the drawn filter must only emit values accepted by the primitive.
      throw new Error(
        `The drawn passing-scope filter ${JSON.stringify(passingScope)} is invalid: ${result.error}`,
      );
    }
    return {
      config: {
        [TESTING_SECTION]: {
          [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: passingScope,
        },
      },
      expected: {
        [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: result.value,
      },
    };
  });
}

function arbitraryTestingConfig(): fc.Arbitrary<GeneratedTestingConfig> {
  return testingConfigFrom(arbitraryPathFilter());
}

function canonicalTestingSection(section: TestingConfig): string {
  const canonical = canonicalDescriptorJson(section, TESTING_SECTION);
  if (!canonical.ok) throw new Error(canonical.error);
  return canonical.value;
}

/**
 * A testing section that never equals the descriptor's own default. Evidence that
 * asserts a resolved section against a generated expectation cannot tell a resolver
 * honoring its product directory from one falling back to defaults when the two
 * coincide, so every draw here differs from the default.
 */
function arbitraryDiscriminatingTestingConfig(): fc.Arbitrary<GeneratedTestingConfig> {
  const defaultSection = canonicalTestingSection(testingConfigDescriptor.defaults);
  return testingConfigFrom(arbitraryDiscriminatingPathFilter()).map((generated) => {
    if (canonicalTestingSection(generated.expected) === defaultSection) {
      throw new Error(
        `CONFIG_TEST_GENERATOR.discriminatingTestingConfig() produced the descriptor default ${defaultSection}`,
      );
    }
    return generated;
  });
}

function arbitraryHarnessEnvironmentConfig(): fc.Arbitrary<GeneratedHarnessEnvironmentConfig> {
  // Fixed structure: explicit tests cover optional shapes; add narrower generators for consumers that need shape variability.
  return fc
    .record({
      marketplaceName: arbitraryConfigKey(),
      marketplaceSource: arbitraryConfigKey(),
      pluginName: arbitraryConfigKey(),
      pluginVersion: arbitraryConfigKey(),
      skillName: arbitraryConfigKey(),
      skillSource: arbitraryConfigKey(),
    })
    .map((
      {
        marketplaceName,
        marketplaceSource,
        pluginName,
        pluginVersion,
        skillName,
        skillSource,
      },
    ) => {
      const section = {
        [HARNESS_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
            {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.TARGET_AGENTS]: [
                AGENT.CODEX,
                AGENT.CLAUDE_CODE,
              ],
            },
          ],
        },
        [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENTS]: {
          [AGENT.CODEX]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: false,
          },
          [AGENT.CLAUDE_CODE]: {
            [HARNESS_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: true,
          },
        },
        [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
            {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: marketplaceSource,
            },
          ],
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
            {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CLAUDE_CODE,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.VERSION]: pluginVersion,
            },
          ],
          [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
            {
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.AGENT]: AGENT.CODEX,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
              [HARNESS_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: skillSource,
            },
          ],
        },
      };
      return {
        config: {
          [HARNESS_ENVIRONMENT_SECTION]: section,
        },
        expected: {
          instructions: {
            files: [
              {
                path: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                targetAgents: [
                  AGENT.CODEX,
                  AGENT.CLAUDE_CODE,
                ],
              },
            ],
          },
          agents: {
            [AGENT.CODEX]: {
              enabled: false,
              hooks: {
                sessionStart: {
                  compactStdout: false,
                },
              },
            },
            [AGENT.CLAUDE_CODE]: {
              enabled: true,
              hooks: {
                sessionStart: {
                  compactStdout: true,
                },
              },
            },
          },
          pluginBootstrap: {
            marketplaces: [
              {
                agent: AGENT.CLAUDE_CODE,
                name: marketplaceName,
                source: marketplaceSource,
              },
            ],
            plugins: [
              {
                agent: AGENT.CLAUDE_CODE,
                name: pluginName,
                marketplace: marketplaceName,
                version: pluginVersion,
              },
            ],
            skills: [
              {
                agent: AGENT.CODEX,
                name: skillName,
                source: skillSource,
              },
            ],
          },
        },
      };
    });
}

function arbitraryTempPrefix(): fc.Arbitrary<string> {
  return arbitraryConfigKey().map((key) => `${key}-`);
}

function arbitraryEnvironmentSentinel(): fc.Arbitrary<GeneratedEnvironmentSentinel> {
  return fc
    .record({
      key: arbitraryConfigKey(),
      value: arbitraryConfigScalar(),
    })
    .map(({ key, value }) => ({ key: `${ENVIRONMENT_SENTINEL_PREFIX}${key.toUpperCase()}`, value }));
}

function arbitraryConfigCliDeterminismCase(): fc.Arbitrary<GeneratedConfigCliDeterminismCase> {
  return fc.record({
    asJson: fc.boolean(),
    productDir: arbitraryProductDir(),
    resolutionError: fc.option(arbitraryRejectedDescriptorResolution().map(({ error }) => error), { nil: undefined }),
    readError: fc.option(arbitraryConfigScalar(), { nil: undefined }),
    includeDescriptor: fc.boolean(),
  });
}

function arbitrarySpecTreeRejectedKindMapConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .uniqueArray(fc.constantFrom(...Object.keys(KIND_REGISTRY)), {
      minLength: 1,
      maxLength: Object.keys(KIND_REGISTRY).length,
    })
    .map((kinds) => ({
      [SPEC_TREE_SECTION]: {
        [SPEC_TREE_CONFIG_FIELDS.KINDS]: Object.fromEntries(
          kinds.map((kind) => [kind, KIND_REGISTRY[kind as keyof typeof KIND_REGISTRY]]),
        ),
      },
    }));
}

function arbitrarySpecTreeArrayKindsConfig(): fc.Arbitrary<GeneratedSpecTreeArrayKindsConfig> {
  return fc
    .uniqueArray(fc.constantFrom(...(Object.keys(KIND_REGISTRY) as (keyof typeof KIND_REGISTRY)[])), {
      minLength: 1,
      maxLength: Object.keys(KIND_REGISTRY).length,
    })
    .map((selectedKinds) => ({
      selectedKinds,
      config: {
        [SPEC_TREE_SECTION]: {
          [SPEC_TREE_CONFIG_FIELDS.KINDS]: [...selectedKinds],
        },
      },
    }));
}

function arbitrarySpecTreeKindField(): fc.Arbitrary<string> {
  return fc.constant(SPEC_TREE_CONFIG_FIELDS.KINDS);
}

function arbitraryRejectedDescriptorResolution(): fc.Arbitrary<GeneratedRejectedDescriptorResolution> {
  return fc
    .record({ generated: arbitraryModeDescriptor(), productDir: arbitraryProductDir() })
    .map(({ generated, productDir }) => {
      const rejected = generated.descriptor.validate(generated.invalid);
      const resolved = resolveConfigFromReadResult(
        {
          kind: CONFIG_FILE_READ_KIND.OK,
          file: configFileForFormat(
            productDir,
            CONFIG_FILE_FORMAT.JSON,
            JSON.stringify({ [generated.section]: generated.invalid }),
          ),
        },
        [generated.descriptor],
      );
      if (rejected.ok || resolved.ok) {
        throw new Error(`generated descriptor ${generated.section} accepted its invalid section`);
      }
      return { error: resolved.error, section: generated.section, validatorMessage: rejected.error };
    });
}

function arbitraryTokenDescriptor(): fc.Arbitrary<GeneratedTokenDescriptor> {
  return fc
    .record({
      section: arbitraryConfigKey(),
      tokenDefault: arbitraryConfigScalar(),
    })
    .map(({ section, tokenDefault }) => buildTokenDescriptor(section, tokenDefault));
}

function arbitraryTokenDescriptors(options: GeneratedDescriptorOptions): fc.Arbitrary<GeneratedTokenDescriptor[]> {
  return fc
    .tuple(
      fc.uniqueArray(arbitraryConfigKey(), {
        minLength: options.minLength,
        maxLength: options.maxLength,
      }),
      fc.array(arbitraryConfigScalar(), {
        minLength: options.minLength,
        maxLength: options.maxLength,
      }),
    )
    .map(([sections, tokenDefaults]) =>
      sections.map((section, index) => buildTokenDescriptor(section, tokenDefaults[index % tokenDefaults.length]))
    );
}

function arbitraryTokenDescriptorPair(): fc.Arbitrary<readonly [GeneratedTokenDescriptor, GeneratedTokenDescriptor]> {
  return arbitraryTokenDescriptors({ minLength: 2, maxLength: 2 }).map((descriptors) => {
    const [first, second] = descriptors;
    return [first, second] as const;
  });
}

function arbitraryModeDescriptor(): fc.Arbitrary<GeneratedModeDescriptor> {
  return fc
    .record({
      section: arbitraryConfigKey(),
      modes: fc.uniqueArray(arbitraryConfigScalar(), {
        minLength: 3,
        maxLength: 3,
      }),
    })
    .map(({ section, modes }) => {
      const [defaultMode, overrideMode, invalidMode] = modes;
      return buildModeDescriptor(section, defaultMode, overrideMode, invalidMode);
    });
}

function arbitraryDirectoryScope(): fc.Arbitrary<GeneratedDirectoryScope> {
  return fc.record({
    productDirectory: arbitraryConfigKey(),
    nestedDirectory: arbitraryConfigKey(),
  });
}

const DESCRIPTOR_SET_MIN_SIZE = 2;
const DESCRIPTOR_SET_MAX_SIZE = 5;
const CONFIG_FORMAT_MIN_SECTIONS = 1;
const CONFIG_FORMAT_MAX_SECTIONS = 3;
const TOKENS_PER_DESCRIPTOR = 2;
const RESOLUTION_SCOPE_TOKEN_COUNT = 4;
const RESOLUTION_SCOPE_NAME_COUNT = 3;

function arbitraryDescriptorSet(): fc.Arbitrary<GeneratedDescriptorSet> {
  return fc
    .uniqueArray(arbitraryConfigKey(), { minLength: DESCRIPTOR_SET_MIN_SIZE, maxLength: DESCRIPTOR_SET_MAX_SIZE })
    .chain((sections) =>
      fc.record({
        sections: fc.constant(sections),
        tokens: fc.uniqueArray(arbitraryConfigScalar(), {
          minLength: sections.length * TOKENS_PER_DESCRIPTOR,
          maxLength: sections.length * TOKENS_PER_DESCRIPTOR,
        }),
        declaredCount: fc.integer({ min: 1, max: sections.length - 1 }),
      })
    )
    .map(({ sections, tokens, declaredCount }) => {
      const generated = sections.map((section, index) => ({
        ...buildTokenDescriptor(section, tokens[index * TOKENS_PER_DESCRIPTOR]),
        override: { [CONFIG_TEST_FIELDS.TOKEN]: tokens[index * TOKENS_PER_DESCRIPTOR + 1] },
      }));
      const declared = generated.slice(0, declaredCount);
      return {
        descriptors: generated.map((entry) => entry.descriptor),
        declared,
        omitted: generated.slice(declaredCount),
        config: Object.fromEntries(declared.map((entry) => [entry.section, entry.override])),
      };
    });
}

function arbitraryConfigEnvironmentCase(): fc.Arbitrary<GeneratedConfigEnvironmentCase> {
  return fc.record({
    descriptorSet: arbitraryDescriptorSet(),
    sentinel: arbitraryEnvironmentSentinel(),
  });
}

function arbitraryResolutionScopeScenario(): fc.Arbitrary<GeneratedResolutionScopeScenario> {
  return fc
    .record({
      names: fc.uniqueArray(arbitraryConfigKey(), {
        minLength: RESOLUTION_SCOPE_NAME_COUNT + 1,
        maxLength: RESOLUTION_SCOPE_NAME_COUNT + 1,
      }),
      tokens: fc.uniqueArray(arbitraryConfigScalar(), {
        minLength: RESOLUTION_SCOPE_TOKEN_COUNT,
        maxLength: RESOLUTION_SCOPE_TOKEN_COUNT,
      }),
    })
    .map(({ names, tokens }) => {
      const [productDirectory, nestedDirectory, unrecognizedName, section] = names;
      const [defaultToken, parentToken, rootToken, nestedToken] = tokens;
      return {
        productDirectory,
        nestedDirectory,
        unrecognizedName,
        descriptor: buildTokenDescriptor(section, defaultToken),
        parentToken,
        rootToken,
        nestedToken,
      };
    });
}

function arbitraryConfigFormatScenario(): fc.Arbitrary<GeneratedConfigFormatScenario> {
  return fc
    .uniqueArray(arbitraryConfigKey(), {
      minLength: CONFIG_FORMAT_MIN_SECTIONS,
      maxLength: CONFIG_FORMAT_MAX_SECTIONS,
    })
    .chain((sections) =>
      fc.uniqueArray(arbitraryConfigScalar(), { minLength: sections.length, maxLength: sections.length }).map((
        tokens,
      ) => ({
        config: Object.fromEntries(
          sections.map((section, index) => [section, { [CONFIG_TEST_FIELDS.TOKEN]: tokens[index] }]),
        ),
      }))
    );
}

function buildTokenDescriptor(section: string, tokenDefault: string): GeneratedTokenDescriptor {
  const defaults = { [CONFIG_TEST_FIELDS.TOKEN]: tokenDefault };
  return {
    section,
    defaults,
    descriptor: {
      section,
      defaults,
      validate(value: unknown): Result<GeneratedTokenSection> {
        if (typeof value !== "object" || value === null) {
          return { ok: false, error: `${section} must be an object` };
        }
        const candidate = value as { readonly [CONFIG_TEST_FIELDS.TOKEN]?: unknown };
        const token = candidate[CONFIG_TEST_FIELDS.TOKEN];
        if (typeof token !== "string") {
          return {
            ok: false,
            error: `${section}.${CONFIG_TEST_FIELDS.TOKEN} must be a string`,
          };
        }
        return {
          ok: true,
          value: { [CONFIG_TEST_FIELDS.TOKEN]: token },
        };
      },
    },
  };
}

function buildModeDescriptor(
  section: string,
  defaultMode: string,
  overrideMode: string,
  invalidMode: string,
): GeneratedModeDescriptor {
  const defaults = { [CONFIG_TEST_FIELDS.MODE]: defaultMode };
  const override = { [CONFIG_TEST_FIELDS.MODE]: overrideMode };
  const invalid = { [CONFIG_TEST_FIELDS.MODE]: invalidMode };
  const allowedModes = new Set([defaultMode, overrideMode]);

  return {
    section,
    defaults,
    override,
    invalid,
    descriptor: {
      section,
      defaults,
      validate(value: unknown): Result<GeneratedModeSection> {
        if (typeof value !== "object" || value === null) {
          return { ok: false, error: `${section} section must be an object` };
        }
        const candidate = value as { readonly [CONFIG_TEST_FIELDS.MODE]?: unknown };
        const mode = candidate[CONFIG_TEST_FIELDS.MODE];
        if (typeof mode !== "string" || !allowedModes.has(mode)) {
          return {
            ok: false,
            error: `${section}.${CONFIG_TEST_FIELDS.MODE} must match a generated descriptor mode`,
          };
        }
        return {
          ok: true,
          value: { [CONFIG_TEST_FIELDS.MODE]: mode },
        };
      },
    },
  };
}
