import * as fc from "fast-check";

import type { ConfigFileReadResult } from "@/config/index";
import {
  PATH_FILTER_CONFIG_FIELDS,
  type PathFilterConfig,
  validatePathFilterConfig,
} from "@/config/primitives/path-filter";
import type { ConfigDescriptor, Result } from "@/config/types";
import {
  AGENT_ENVIRONMENT_CONFIG_FIELDS,
  AGENT_ENVIRONMENT_SECTION,
  AGENT_RUNTIME,
  type AgentEnvironmentConfig,
  DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
} from "@/domains/agent-environment/config";
import {
  KIND_REGISTRY,
  SPEC_TREE_CONFIG_FIELDS,
  SPEC_TREE_SECTION,
  type SpecTreeKindCategory,
} from "@/lib/spec-tree/config";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION, type TestingConfig } from "@/testing/config";

export const CONFIG_TEST_FIELDS = {
  TOKEN: "token",
  MODE: "mode",
} as const;

const ENVIRONMENT_SENTINEL_PREFIX = "SPX_TEST_SENTINEL_";

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

export type GeneratedInvalidSpecTreeConfig = {
  readonly config: Record<string, unknown>;
  readonly error: string;
  readonly offendingKind: string;
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

export type GeneratedKindOverride = {
  readonly kind: string;
  readonly definition: {
    readonly category: SpecTreeKindCategory;
    readonly label: string;
    readonly suffix: string;
    readonly aliases: readonly string[];
  };
};

export type GeneratedResolutionScope = {
  readonly productDirectory: string;
  readonly nestedDirectory: string;
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

export type GeneratedAgentEnvironmentConfig = {
  readonly config: Record<string, unknown>;
  readonly expected: AgentEnvironmentConfig;
};

export const CONFIG_TEST_GENERATOR = {
  absentConfigFileReadResult: arbitraryAbsentConfigFileReadResult,
  agentEnvironmentConfig: arbitraryAgentEnvironmentConfig,
  emptyConfig: arbitraryEmptyConfig,
  environmentSentinel: arbitraryEnvironmentSentinel,
  invalidSpecTreeConfig: arbitraryInvalidSpecTreeConfig,
  key: arbitraryConfigKey,
  scalar: arbitraryConfigScalar,
  specTreeKindField: arbitrarySpecTreeKindField,
  specTreeUnknownKindError: arbitrarySpecTreeUnknownKindError,
  specTreeDefaultsConfig: arbitrarySpecTreeDefaultsConfig,
  specTreeSubsetConfig: arbitrarySpecTreeSubsetConfig,
  specTreeArrayKindsConfig: arbitrarySpecTreeArrayKindsConfig,
  tempPrefix: arbitraryTempPrefix,
  tokenDescriptorPair: arbitraryTokenDescriptorPair,
  tokenDescriptor: arbitraryTokenDescriptor,
  tokenDescriptors: arbitraryTokenDescriptors,
  modeDescriptor: arbitraryModeDescriptor,
  kindOverride: arbitraryKindOverride,
  productDir: arbitraryProductDir,
  pathFilter: arbitraryPathFilter,
  invalidPathFilter: arbitraryInvalidPathFilter,
  testingConfig: arbitraryTestingConfig,
  resolutionScope: arbitraryResolutionScope,
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
    error: (path) => `${path} must be an object`,
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
      error: (path) => `${path}.${field} must be an array of strings`,
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

function arbitraryTestingConfig(): fc.Arbitrary<GeneratedTestingConfig> {
  return arbitraryPathFilter().map((passingScope) => {
    const result = validatePathFilterConfig(
      passingScope,
      `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
    );
    if (!result.ok) {
      // Guard the generator contract: arbitraryPathFilter must only emit values accepted by the primitive.
      throw new Error(
        `CONFIG_TEST_GENERATOR.pathFilter() produced an invalid filter ${
          JSON.stringify(passingScope)
        }: ${result.error}`,
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

function arbitraryAgentEnvironmentConfig(): fc.Arbitrary<GeneratedAgentEnvironmentConfig> {
  // E0 mapping evidence uses one complete representative shape; child packets add broader shape coverage when
  // they own partial runtime, instruction, or bootstrap behavior.
  return fc
    .record({
      marketplaceName: arbitraryConfigKey(),
      marketplaceSource: arbitraryConfigKey(),
      pluginName: arbitraryConfigKey(),
      pluginVersion: arbitraryConfigKey(),
      skillName: arbitraryConfigKey(),
      skillSource: arbitraryConfigKey(),
    })
    .map(({ marketplaceName, marketplaceSource, pluginName, pluginVersion, skillName, skillSource }) => {
      const section = {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.INSTRUCTIONS]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.FILES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.PATH]: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.TARGET_RUNTIMES]: [
                AGENT_RUNTIME.CODEX,
                AGENT_RUNTIME.CLAUDE_CODE,
              ],
            },
          ],
        },
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
          [AGENT_RUNTIME.CODEX]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: false,
          },
          [AGENT_RUNTIME.CLAUDE_CODE]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.ENABLED]: true,
          },
        },
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGIN_BOOTSTRAP]: {
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACES]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: marketplaceName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: marketplaceSource,
            },
          ],
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.PLUGINS]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CLAUDE_CODE,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: pluginName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.MARKETPLACE]: marketplaceName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.VERSION]: pluginVersion,
            },
          ],
          [AGENT_ENVIRONMENT_CONFIG_FIELDS.SKILLS]: [
            {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIME]: AGENT_RUNTIME.CODEX,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.NAME]: skillName,
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SOURCE]: skillSource,
            },
          ],
        },
      };
      return {
        config: {
          [AGENT_ENVIRONMENT_SECTION]: section,
        },
        expected: {
          instructions: {
            files: [
              {
                path: DEFAULT_AGENT_INSTRUCTION_FILE_PATH,
                targetRuntimes: [
                  AGENT_RUNTIME.CODEX,
                  AGENT_RUNTIME.CLAUDE_CODE,
                ],
              },
            ],
          },
          runtimes: {
            [AGENT_RUNTIME.CODEX]: {
              enabled: false,
            },
            [AGENT_RUNTIME.CLAUDE_CODE]: {
              enabled: true,
            },
          },
          pluginBootstrap: {
            marketplaces: [
              {
                runtime: AGENT_RUNTIME.CLAUDE_CODE,
                name: marketplaceName,
                source: marketplaceSource,
              },
            ],
            plugins: [
              {
                runtime: AGENT_RUNTIME.CLAUDE_CODE,
                name: pluginName,
                marketplace: marketplaceName,
                version: pluginVersion,
              },
            ],
            skills: [
              {
                runtime: AGENT_RUNTIME.CODEX,
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

function arbitraryAbsentConfigFileReadResult(): fc.Arbitrary<Result<ConfigFileReadResult>> {
  return fc.constant({ ok: true, value: { kind: "absent" } });
}

function arbitrarySpecTreeDefaultsConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc.constant({ [SPEC_TREE_SECTION]: { [SPEC_TREE_CONFIG_FIELDS.KINDS]: { ...KIND_REGISTRY } } });
}

function arbitrarySpecTreeSubsetConfig(): fc.Arbitrary<Record<string, unknown>> {
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

function arbitraryInvalidSpecTreeConfig(): fc.Arbitrary<GeneratedInvalidSpecTreeConfig> {
  return arbitraryConfigKey()
    .filter((kind) => !Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind))
    .map((offendingKind) => ({
      offendingKind,
      error: `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} contains unknown kind "${offendingKind}"`,
      config: {
        [SPEC_TREE_SECTION]: {
          [SPEC_TREE_CONFIG_FIELDS.KINDS]: {
            [offendingKind]: {
              category: KIND_REGISTRY.enabler.category,
              suffix: `.${offendingKind}`,
            },
          },
        },
      },
    }));
}

function arbitrarySpecTreeKindField(): fc.Arbitrary<string> {
  return fc.constant(SPEC_TREE_CONFIG_FIELDS.KINDS);
}

function arbitrarySpecTreeUnknownKindError(): fc.Arbitrary<string> {
  return arbitraryConfigKey()
    .filter((kind) => !Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind))
    .map((kind) => `${SPEC_TREE_SECTION}.${SPEC_TREE_CONFIG_FIELDS.KINDS} contains unknown kind "${kind}"`);
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
    if (first === undefined || second === undefined) {
      throw new Error("Token descriptor pair generator returned an incomplete descriptor set");
    }
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
      if (defaultMode === undefined || overrideMode === undefined || invalidMode === undefined) {
        throw new Error("Mode descriptor generator returned an incomplete mode set");
      }

      return buildModeDescriptor(section, defaultMode, overrideMode, invalidMode);
    });
}

function arbitraryKindOverride(category: SpecTreeKindCategory): fc.Arbitrary<GeneratedKindOverride> {
  return arbitraryConfigKey()
    .filter((kind) => !Object.prototype.hasOwnProperty.call(KIND_REGISTRY, kind))
    .map((kind) => ({
      kind,
      definition: {
        category,
        label: kind,
        suffix: `.${kind}`,
        aliases: [],
      },
    }));
}

function arbitraryResolutionScope(): fc.Arbitrary<GeneratedResolutionScope> {
  return fc
    .record({
      productDirectory: arbitraryConfigKey(),
      nestedDirectory: arbitraryConfigKey(),
    })
    .map(({ productDirectory, nestedDirectory }) => ({
      productDirectory,
      nestedDirectory,
    }));
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
